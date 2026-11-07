import { memo, useMemo, useState, useCallback, useSyncExternalStore } from "react";
import { BaseEdge, EdgeLabelRenderer, useStore, type EdgeProps, type ConnectionLineComponentProps } from "@xyflow/react";
import {
  buildRouteChain,
  computeEdgeEndpoints,
  getBezierPath,
  type Point,
  type PortDirection,
} from "./edgeRouting";
import { handleColorOf } from "./edgeColors";
import {
  laneGroupForEdge,
  laneIndexOfEdge,
  selectDerivedEdgeFlowState,
} from "./edgeStoreSelectors";
import {
  createArrowMarker,
  pointOnPolyline,
  polylineLength,
  type EdgeLabelPoint,
} from "./edgeLabel";
import { EdgeLabelTitle } from "./EdgeLabelTitle";

// ── 箭头 marker ──────────────────────────────────────────────────────

/** 为每种颜色生成稳定的 marker id */
function getArrowMarkerId(color: string): string {
  return `arrow-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
}

// ── 工具函数 ──────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

type NodeRect = { x: number; y: number; width: number; height: number };

/** 从 RF 内部节点提取流程坐标矩形；尺寸未测量完成时返回 null。 */
function nodeRectOf(
  node:
    | {
        internals?: { positionAbsolute?: { x?: number; y?: number } };
        position?: { x: number; y: number };
        measured?: { width?: number; height?: number };
      }
    | undefined,
): NodeRect | null {
  const x = node?.internals?.positionAbsolute?.x ?? node?.position?.x;
  const y = node?.internals?.positionAbsolute?.y ?? node?.position?.y;
  const width = node?.measured?.width;
  const height = node?.measured?.height;
  if (x === undefined || y === undefined || !width || !height) return null;
  return { x, y, width, height };
}

/** 把 EdgeProps 的 targetPosition/sourcePosition 转成 PortDirection */
function toPortDir(
  pos: EdgeProps["targetPosition"] | EdgeProps["sourcePosition"] | "left" | "right" | "top" | "bottom",
): PortDirection {
  switch (pos) {
    case "left":   return "left";
    case "right":  return "right";
    case "top":    return "top";
    case "bottom": return "bottom";
    default:       return "right";
  }
}

/**
 * 标签默认沿入线放在目标左侧。若线太短，标签会压住目标卡片；
 * 这里按目标卡片外沿留出安全间距；屏幕缩放后的卡片宽度用 zoom 反算。
 */
function placeLabelClearOfTarget(
  point: EdgeLabelPoint,
  targetX: number,
  targetY: number,
  targetPosition: EdgeProps["targetPosition"],
  targetWidth: number,
  zoom: number,
): EdgeLabelPoint {
  const safeZoom = zoom > 0 ? zoom : 1;
  const cardScreenHalf = (Math.max(200, targetWidth) * safeZoom) / 2;
  const gap = Math.max(14, cardScreenHalf * 0.08);
  if (targetPosition === "left")   return { x: Math.min(point.x, targetX - gap), y: point.y };
  if (targetPosition === "right")  return { x: Math.max(point.x, targetX + gap), y: point.y };
  if (targetPosition === "top")    return { x: point.x, y: Math.min(point.y, targetY - gap) };
  return { x: point.x, y: Math.max(point.y, targetY + gap) };
}

/**
 * 在整条路线的采样折线上取标签锚点：
 * 取路线后段（约 70%~85% 处），避开起点和终点区域。
 * 多条同目标边按 lane 序号沿曲线后退，避免标签重叠。
 */
const toPosition = (dir: PortDirection): EdgeProps["targetPosition"] => dir as EdgeProps["targetPosition"];

function labelPointOnSamples(
  samples: readonly Point[],
  laneIndex: number,
  laneCount: number,
): EdgeLabelPoint {
  const mutable: EdgeLabelPoint[] = samples.map((p) => ({ x: p.x, y: p.y }));
  const total = polylineLength(mutable);
  if (total < 1 || mutable.length === 0) {
    const last = mutable[mutable.length - 1];
    return { x: last?.x ?? 0, y: last?.y ?? 0 };
  }

  // 标签放在路线的 70%~85% 区间，lane 偏移让同目标多线错开
  const baseRatio = 0.78;
  const laneStep = 0.06;
  const offset = laneIndex - (laneCount - 1) / 2;
  const ratio = clamp(baseRatio - offset * laneStep, 0.15, 0.92);

  return pointOnPolyline(mutable, ratio);
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const reducedMotionSubscribe = (onChange: () => void) => {
  const mq = window.matchMedia(reducedMotionQuery);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/** 系统开启「减少动态效果」时停用连线流动动画（SMIL 不受 CSS 动画禁用影响）。 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    reducedMotionSubscribe,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

// ── FlowEdge 组件 ─────────────────────────────────────────────────────

export const FlowEdge = memo(function FlowEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    data,
  } = props;

  // ── zoom & lane info from derived store ───────────────────────────
  const derived = useStore(selectDerivedEdgeFlowState);
  const zoom = derived.zoom;
  const screenZoom = Math.max(zoom, 0.001);
  const showLabel = zoom >= 0.18;

  const tgtNode = useStore((st) =>
    props.target ? st.nodeLookup.get(props.target) : undefined,
  );
  const srcNode = useStore((st) =>
    props.source ? st.nodeLookup.get(props.source) : undefined,
  );

  // 同一目标/入口的边按 id 稳定排序
  const laneGroup = laneGroupForEdge(derived, props.target, props.targetHandleId);
  const laneIndex = laneIndexOfEdge(laneGroup, id);
  const laneCount = laneGroup.ids.length;

  const reducedMotion = usePrefersReducedMotion();

  // ── hover state ───────────────────────────────────────────────────
  const [hovered, setHovered] = useState(false);
  const onMouseEnter = useCallback(() => setHovered(true), []);
  const onMouseLeave = useCallback(() => setHovered(false), []);

  // ── 通用路由：候选生成 + 不变式过滤（线不穿卡），几何未测完成时回退手柄坐标 ──
  const geometry = useMemo(() => {
    const sourceRect = nodeRectOf(srcNode);
    const targetRect = nodeRectOf(tgtNode);
    if (!sourceRect || !targetRect) {
      // 首帧回退：直接按 RF 手柄坐标连一条单段曲线
      const fallback = buildRouteChain([
        {
          from: { x: sourceX, y: sourceY },
          to: { x: targetX, y: targetY },
          fromDir: toPortDir(sourcePosition),
          toDir: toPortDir(targetPosition),
        },
      ]);
      return {
        path: fallback.path,
        samples: fallback.samples,
        start: { x: sourceX, y: sourceY },
        end: { x: targetX, y: targetY },
        targetDir: toPortDir(targetPosition),
        legs: 1,
        kind: "direct" as const,
      };
    }
    return computeEdgeEndpoints({
      sourceNode: { id: props.source ?? "source", ...sourceRect },
      targetNode: { id: props.target ?? "target", ...targetRect },
      otherRects: derived.avoidRects(null),
      sourceHandleId: props.sourceHandleId,
      sourceHandlePoint: { x: sourceX, y: sourceY },
      sourceHandleDir: toPortDir(sourcePosition),
    });
  }, [srcNode, tgtNode, derived, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, props.source, props.target, props.sourceHandleId]);

  const path = geometry.path;

  // ── label position ────────────────────────────────────────────────
  const labelPt = labelPointOnSamples(geometry.samples, laneIndex, laneCount);
  const targetWidth = tgtNode?.measured?.width ?? 320;
  const placedLabel = placeLabelClearOfTarget(
    labelPt,
    geometry.end.x,
    geometry.end.y,
    toPosition(geometry.targetDir),
    targetWidth,
    zoom,
  );
  const labelX = placedLabel.x;
  const labelY = placedLabel.y;
  const srcPt = geometry.start;
  const tgtPt = geometry.end;

  const label = (data?.label as string) ?? "";
  const targetTitle = (tgtNode?.data as { title?: unknown } | undefined)?.title;
  const targetName =
    typeof targetTitle === "string" && targetTitle.trim() ? targetTitle.trim() : "";
  const isBackEdge =
    tgtPt.x <= srcPt.x - 8 && Math.abs(tgtPt.x - srcPt.x) > Math.abs(tgtPt.y - srcPt.y);
  const direction = isBackEdge ? "\u2190" : "\u2192";
  const destination = targetName ? `${direction} ${targetName}` : direction;

  // ── stroke color from sourceHandleId ──────────────────────────────
  const strokeColor = selected ? "var(--fc-edge-selected)" : handleColorOf(props.sourceHandleId);

  // ── arrow marker config ─────────────────────────────────────────
  // 箭头与线同色。尺寸按 1/zoom 反向补偿（fit view 后仍恒定可见），
  // 但补偿系数封顶 2.2：zoom 过小时无限补偿会让箭头比节点还醒目。
  const markerId = getArrowMarkerId(strokeColor);
  const arrowScale = Math.min(2.2, 1 / screenZoom);
  const arrowMarker = useMemo(
    () => createArrowMarker(markerId, strokeColor, arrowScale),
    [markerId, strokeColor, arrowScale],
  );

  // ── zoom-compensated sizes ────────────────────────────────────────
  // 线宽：hover 2.5，selected 3，default 2（均除以 screenZoom）
  const baseStrokeWidth = 2 / screenZoom;
  const hoverStrokeWidth = 2.5 / screenZoom;
  const selectedStrokeWidth = 3 / screenZoom;
  const mainStrokeWidth = selected
    ? selectedStrokeWidth
    : hovered
      ? hoverStrokeWidth
      : baseStrokeWidth;

  // 起点小圆点：标记连接从哪里出发
  const dotRadius = 2.5 / screenZoom;

  // 选中时轻微 drop-shadow 发光
  const glowFilter = selected
    ? "drop-shadow(0 0 4px rgba(99,102,241,0.5))"
    : undefined;

  return (
    <>
      {/* ── SVG marker 定义：箭头附着在 path 终点 ─────────────────── */}
      <defs>
        <marker
          id={arrowMarker.id}
          markerWidth={arrowMarker.markerWidth}
          markerHeight={arrowMarker.markerHeight}
          refX={arrowMarker.refX}
          refY={arrowMarker.refY}
          orient={arrowMarker.orient}
          markerUnits="userSpaceOnUse"
        >
          <path d={arrowMarker.path} fill={arrowMarker.color} />
        </marker>
      </defs>

      {/* ── 主连线：贝塞尔曲线，marker-end 附着箭头 ───────────────── */}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${arrowMarker.id})`}
        style={{
          stroke: strokeColor,
          strokeWidth: mainStrokeWidth,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          opacity: selected ? 1.0 : 0.92,
          filter: glowFilter,
          vectorEffect: "non-scaling-stroke",
        }}
      />

      {/* ── 起点圆点：标记连接从哪里出发 ───────────────────────────── */}
      <circle
        cx={srcPt.x}
        cy={srcPt.y}
        r={dotRadius}
        fill={strokeColor}
        stroke="var(--fc-edge-anchor-stroke, #fff)"
        strokeWidth={0.8 / screenZoom}
        pointerEvents="none"
      />

      {/* ── 流动动画小点：沿路线从起点移动到终点（尊重减少动态效果） ── */}
      {!reducedMotion ? (
        <circle r={2.5 / screenZoom} fill={strokeColor} opacity={0.9} pointerEvents="none">
          <animateMotion
            dur="2s"
            repeatCount="indefinite"
            path={path}
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      ) : null}

      {/* ── 透明命区域：宽 path，方便点击/悬停选中 ───────────────── */}
      {/* strokeWidth + non-scaling-stroke：命中区恒定 10 屏幕像素，
          不随 zoom 放大后大范围盖住附近的连接点。点击选中由 RF 边组原生处理。 */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
        style={{ cursor: "pointer", vectorEffect: "non-scaling-stroke" }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />

      {/* ── 标签（仅 selected 时显示） ─────────────────────────────── */}
      {label && showLabel && selected ? (
        <EdgeLabelRenderer>
          <div
            className="fc-edge-label-anchor"
            data-edge-id={id}
            data-target-id={props.target}
            data-label-lane={laneIndex}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              transform: `translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
          >
            <div
              className="fc-edge-label is-selected"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(-100%, -50%) scale(${Math.max(1, Math.min(3.2, 1 / screenZoom))})`,
                transformOrigin: "right center",
              }}
              title={`${label} ${destination}`}
            >
              <EdgeLabelTitle edgeId={id} value={label} />
              <span
                className="fc-edge-label-target"
                aria-label={`\u76EE\u6807\u754C\u9762\uFF1A${targetName || "\u672A\u547D\u540D\u754C\u9762"}`}
              >
                {destination}
              </span>
            </div>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

// ── 连接预览线（拖动创建连接时的临时线） ──────────────────────────────

/**
 * 交互式连接预览线：拖出连线时的实时反馈。
 * - 颜色继承起点热点的语义色（与落线后的真实连线一致，所见即所得）；
 * - 虚线沿路径流动（SMIL dash 动画，尊重 prefers-reduced-motion）；
 * - 吸附到合法目标时变实线 + 发光 + 箭头；非法目标保持虚线灰色提示不可连；
 * - 线宽随 1/zoom 反向补偿，任何缩放级别手感一致。
 */
export const BezierConnectionLine = memo(function BezierConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  fromHandle,
  connectionStatus,
}: ConnectionLineComponentProps) {
  const srcDir = toPortDir(fromPosition);
  const tgtDir = toPortDir(toPosition);

  const bez = getBezierPath(
    { x: fromX, y: fromY },
    { x: toX, y: toY },
    srcDir,
    tgtDir,
  );

  const reducedMotion = usePrefersReducedMotion();
  const color = handleColorOf(fromHandle?.id ?? null);
  const attached = connectionStatus === "valid";
  const invalid = connectionStatus === "invalid";

  // 拖拽中把线宽/虚线按 zoom 反向放大，屏幕上恒定粗细
  const zoom = useStore((st) => st.transform[2]);
  const screenZoom = Math.max(zoom, 0.001);
  const width = 2.4 / screenZoom;
  const dash = `${7 / screenZoom} ${5 / screenZoom}`;
  const headR = 3.5 / screenZoom;
  const glowR = 7 / screenZoom;

  const stroke = attached ? color : invalid ? "#94a3b8" : color;
  const opacity = invalid ? 0.45 : attached ? 1 : 0.85;

  return (
    <g>
      {/* 吸附合法目标时的柔光晕底 */}
      {attached ? (
        <path
          d={bez.path}
          fill="none"
          stroke={stroke}
          strokeWidth={width * 2.6}
          strokeLinecap="round"
          opacity={0.18}
        />
      ) : null}
      <path
        d={bez.path}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={attached ? "none" : dash}
        opacity={opacity}
      >
        {!reducedMotion && !attached ? (
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to={String(-(7 + 5) / screenZoom)}
            dur="0.5s"
            repeatCount="indefinite"
          />
        ) : null}
      </path>
      {/* 鼠标端指示点：吸附成功变实心环，否则空心 */}
      <circle
        cx={toX}
        cy={toY}
        r={attached ? glowR : headR}
        fill={attached ? stroke : "var(--fc-surface-input, #fff)"}
        stroke={stroke}
        strokeWidth={width * 0.9}
        opacity={invalid ? 0.4 : 0.95}
      />
    </g>
  );
});
