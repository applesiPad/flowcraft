import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useStore, type EdgeProps } from "@xyflow/react";
import type { NodeGeometry } from './edgeRouting';
import { createBackEdgeLanePath, createBalancedBackEdgePath, normalizeEdgeRouteMode } from './edgeRouting';
import { routeWithCache } from './edgeRoutingCache';
import {
  edgeArrowPolygon,
  chooseEdgeLabelAnchor,
  edgeLabelAnchorStyle,
  estimateEdgeLabelSize,
  edgeLabelCardStyle,
  placeEdgeLabelGroup,
  edgeLaneIndex,
  type EdgeLabelPoint,
  type EdgeLabelRect,
  type EdgeLabelSize,
} from './edgeLabel';

type Pt = { x: number; y: number };

/** 把折线点列转成带圆角拐弯的 path（与 React Flow 内置 smoothstep 的观感一致） */
function roundedPath(points: Pt[], radius: number) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const p = points[i];
    const next = points[i + 1];
    const v1 = { x: p.x - prev.x, y: p.y - prev.y };
    const v2 = { x: next.x - p.x, y: next.y - p.y };
    const l1 = Math.hypot(v1.x, v1.y) || 1;
    const l2 = Math.hypot(v2.x, v2.y) || 1;
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const a = { x: p.x - (v1.x / l1) * r, y: p.y - (v1.y / l1) * r };
    const b = { x: p.x + (v2.x / l2) * r, y: p.y + (v2.y / l2) * r };
    d += `L${a.x} ${a.y}Q${p.x} ${p.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  d += `L${last.x} ${last.y}`;
  return d;
}

/** 把 smoothstep 路径上的关键点用同一套标签锚点规则定位 */
function smoothStepLabelPoint(options: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: EdgeProps["sourcePosition"];
  targetPosition: EdgeProps["targetPosition"];
  laneOffset?: number;
}): EdgeLabelPoint {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, laneOffset = 0 } = options;
  // React Flow 的 smoothstep 中心线：先离开 source，再沿目标方向进入 target。
  // 这里用等价的正交关键点估算标签位置，避免额外依赖内部实现。
  const offset = 18;
  const sourceHorizontal = sourcePosition === "left" || sourcePosition === "right";
  const targetHorizontal = targetPosition === "left" || targetPosition === "right";
  const points: EdgeLabelPoint[] = [{ x: sourceX, y: sourceY }];

  if (sourceHorizontal) {
    points.push({ x: sourceX + (sourcePosition === "right" ? offset : -offset), y: sourceY });
  } else {
    points.push({ x: sourceX, y: sourceY + (sourcePosition === "bottom" ? offset : -offset) });
  }

  if (sourceHorizontal && targetHorizontal) {
    const midX = (sourceX + targetX) / 2;
    points.push({ x: midX, y: sourceY }, { x: midX, y: targetY });
  } else if (!sourceHorizontal && !targetHorizontal) {
    const midY = (sourceY + targetY) / 2;
    points.push({ x: sourceX, y: midY }, { x: targetX, y: midY });
  } else if (sourceHorizontal) {
    points.push({ x: targetX, y: sourceY });
  } else {
    points.push({ x: sourceX, y: targetY });
  }

  if (targetHorizontal) {
    points.push({ x: targetX + (targetPosition === "left" ? -offset : offset), y: targetY });
  } else {
    points.push({ x: targetX, y: targetY + (targetPosition === "top" ? -offset : offset) });
  }
  points.push({ x: targetX, y: targetY });

  return chooseEdgeLabelAnchor(points, { target: { x: targetX, y: targetY }, laneOffset }).point;
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
  // 卡片宽约 320，fit view 时屏幕宽度会缩小；标签不压卡片需要按屏幕坐标换算。
  const cardScreenHalf = (Math.max(200, targetWidth) * safeZoom) / 2;
  const gap = Math.max(14, cardScreenHalf * 0.08);
  if (targetPosition === "left") return { x: Math.min(point.x, targetX - gap), y: point.y };
  if (targetPosition === "right") return { x: Math.max(point.x, targetX + gap), y: point.y };
  if (targetPosition === "top") return { x: point.x, y: Math.min(point.y, targetY - gap) };
  return { x: point.x, y: Math.max(point.y, targetY + gap) };
}


export const FlowEdge = memo(function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } = props;
  const zoom = useStore((st) => st.transform[2]);
  // fit view 在窄窗口下可能只有约 0.24；标签已反向缩放，不应直接消失。
  const showLabel = zoom >= 0.18;
  // 回边路由需要节点真实高度，否则会横穿卡片
  const srcNode = useStore((st) => (props.source ? st.nodeLookup.get(props.source) : undefined));
  const tgtNode = useStore((st) => (props.target ? st.nodeLookup.get(props.target) : undefined));
  // 同一目标/入口的边按 id 稳定排序，保证标签错位可预测且不会重叠
  const laneIndex = useStore((st) => {
    const refs = [...st.edges].map((edge) => ({
      id: edge.id,
      target: edge.target,
      targetHandle: edge.targetHandle ?? null,
    }));
    return edgeLaneIndex(refs, id, props.target, props.targetHandleId ?? null);
  });
  // 同一目标入口的所有边必须共用一组尺寸和 lane 信息，否则每条边会各自判断边界，
  // 出现“前两条在左、第三条跳到上方”的断裂布局。
  const peerInfo = useStore((st) => {
    if (!props.target) return { count: 0, orderedIds: [] as string[], sizes: [] as EdgeLabelSize[] };
    const peers = [...st.edges]
      .filter((edge) => edge.target === props.target && (edge.targetHandle ?? null) === (props.targetHandleId ?? null))
      .map((edge) => ({
        id: edge.id,
        label: String((edge.data as { label?: unknown } | undefined)?.label ?? ""),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const targetNode = st.nodeLookup.get(props.target);
    const title = (targetNode?.data as { title?: unknown } | undefined)?.title;
    const targetName = typeof title === "string" && title.trim() ? title.trim() : "";
    const direction = "→";
    return {
      count: peers.length,
      orderedIds: peers.map((peer) => peer.id),
      sizes: peers.map((peer) => estimateEdgeLabelSize(
        peer.label,
        targetName ? `${direction} ${targetName}` : direction,
        st.transform[2],
      )),
    };
  });
  const viewport = useStore((st) => {
    const [tx, ty, scale] = st.transform;
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return {
      left: -tx / safeScale + 12 / safeScale,
      top: -ty / safeScale + 12 / safeScale,
      right: (st.width - tx) / safeScale - 12 / safeScale,
      bottom: (st.height - ty) / safeScale - 12 / safeScale,
    } satisfies EdgeLabelRect;
  });
  // 获取所有节点的几何信息用于智能避障
  const allNodeGeometries = useStore((st) => {
    const geoms: NodeGeometry[] = [];
    st.nodeLookup.forEach((node) => {
      const x = node.internals?.positionAbsolute?.x ?? node.position.x;
      const y = node.internals?.positionAbsolute?.y ?? node.position.y;
      const width = node.measured?.width ?? 280;
      const height = node.measured?.height ?? 160;
      geoms.push({ id: node.id, x, y, width, height });
    });
    return geoms;
  });

  const routeMode = normalizeEdgeRouteMode((data as { routeMode?: unknown } | undefined)?.routeMode);
  const isBackEdge = sourcePosition === "right" && targetPosition === "left" && targetX <= sourceX - 8;
  const canManualLane = routeMode !== "auto" && !!srcNode && !!tgtNode;

  let path: string;
  let labelX: number;
  let labelY: number;
  let direction = isBackEdge ? "←" : "→";

  if (canManualLane) {
    // 手动通道只贴着源/目标节点上缘或下缘，避免旧版回边全部挤到全局底部。
    const points = createBackEdgeLanePath(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      routeMode,
      allNodeGeometries,
      laneIndex,
    );
    path = roundedPath(points, 18);
    const anchor = chooseEdgeLabelAnchor(points, { target: { x: targetX, y: targetY }, laneOffset: laneIndex });
    const point = placeLabelClearOfTarget(anchor.point, targetX, targetY, targetPosition, tgtNode?.measured?.width ?? 320, zoom);
    labelX = point.x;
    labelY = point.y;
  } else if (isBackEdge) {
    // 自动模式先识别近距离上下闭环；其余回边保持 A* 最短避障。
    const balancedWaypoints = createBalancedBackEdgePath(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      allNodeGeometries,
      laneIndex,
    );
    const waypoints = balancedWaypoints ?? routeWithCache({
      from: { x: sourceX, y: sourceY },
      to: { x: targetX, y: targetY },
      sourceId: props.source,
      targetId: props.target,
      nodeGeometries: allNodeGeometries,
      excludeNodeIds: [props.source, props.target],
    });
    if (waypoints.length === 2) {
      [path, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 18,
        offset: 18,
      });
    } else {
      path = roundedPath(waypoints, 18);
      const anchor = chooseEdgeLabelAnchor(waypoints, { target: { x: targetX, y: targetY }, laneOffset: laneIndex });
      const point = placeLabelClearOfTarget(anchor.point, targetX, targetY, targetPosition, tgtNode?.measured?.width ?? 320, zoom);
      labelX = point.x;
      labelY = point.y;
    }
  } else {
    // 前向边：使用智能避障路由
    
    const waypoints = routeWithCache({
      from: { x: sourceX, y: sourceY },
      to: { x: targetX, y: targetY },
      sourceId: props.source,
      targetId: props.target,
      nodeGeometries: allNodeGeometries,
      excludeNodeIds: [props.source, props.target],
    });

    if (waypoints.length === 2) {
      // 无碰撞：内置光滑路由负责视觉，标签仍用同一套目标侧锚点规则
      [path, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 14,
        offset: 18,
      });
      const anchor = smoothStepLabelPoint({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, laneOffset: laneIndex });
      const point = placeLabelClearOfTarget(anchor, targetX, targetY, targetPosition, tgtNode?.measured?.width ?? 320, zoom);
      labelX = point.x;
      labelY = point.y;
    } else {
      // 有碰撞：同一条绕行路径同时决定描边与标签，标签靠近目标入口
      path = roundedPath(waypoints, 14);
      const anchor = chooseEdgeLabelAnchor(waypoints, { target: { x: targetX, y: targetY }, laneOffset: laneIndex });
      const point = placeLabelClearOfTarget(anchor.point, targetX, targetY, targetPosition, tgtNode?.measured?.width ?? 320, zoom);
      labelX = point.x;
      labelY = point.y;
    }
  }

  const label = (data?.label as string) ?? "";
  const targetTitle = (tgtNode?.data as { title?: unknown } | undefined)?.title;
  const targetName = typeof targetTitle === "string" && targetTitle.trim() ? targetTitle.trim() : "";
  const destination = targetName ? `${direction} ${targetName}` : direction;
  const peerCount = peerInfo.count;
  const size = peerInfo.sizes[laneIndex] ?? estimateEdgeLabelSize(label, destination, zoom);
  const targetAbsolute = tgtNode?.internals?.positionAbsolute;
  const targetMeasured = tgtNode?.measured;
  const targetRect = targetAbsolute
    ? {
        left: targetAbsolute.x,
        top: targetAbsolute.y,
        right: targetAbsolute.x + (targetMeasured?.width ?? 320),
        bottom: targetAbsolute.y + (targetMeasured?.height ?? 180),
      }
    : undefined;
  const avoidRects: EdgeLabelRect[] = allNodeGeometries
    .filter((node) => node.id !== props.target)
    .map((node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }));
  const placement = placeEdgeLabelGroup(
    { x: labelX, y: labelY },
    { x: targetX, y: targetY },
    targetPosition,
    laneIndex,
    peerCount,
    zoom,
    {
      size,
      peerSizes: peerInfo.sizes,
      targetRect,
      outwardGap: 18 / zoom,
      viewport,
      avoidRects,
    },
  );
  const screenZoom = Math.max(zoom, 0.001);
  const edgeColor = selected ? "var(--fc-edge-selected)" : "var(--fc-edge-color)";
  const edgeStrokeWidth = (selected ? 2.6 : 2.1) / screenZoom;
  const mainArrowSize = 9 / screenZoom;
  const mainArrowPoints = edgeArrowPolygon({ x: targetX, y: targetY }, targetPosition ?? "left", mainArrowSize);
  const anchorStyle = edgeLabelAnchorStyle({ x: placement.x, y: placement.y });  const cardStyle = edgeLabelCardStyle(zoom, placement.side);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={undefined}
        style={{
          stroke: edgeColor,
          strokeWidth: edgeStrokeWidth,
        }}
      />
      <polygon
        points={mainArrowPoints}
        fill={edgeColor}
        stroke="var(--fc-edge-anchor-stroke, #fff)"
        strokeWidth={0.8 / screenZoom}
        pointerEvents="none"
      />
      <path d={path} fill="none" stroke="transparent" strokeWidth={18} style={{ cursor: "pointer" }} />
      {label && showLabel && selected ? (
        <EdgeLabelRenderer>
          <div
            className="fc-edge-label-anchor"
            data-edge-id={id}
            data-target-id={props.target}
            data-label-lane={laneIndex}
            style={anchorStyle}
          >
            <div className={`fc-edge-label${selected ? " is-selected" : ""}`} style={cardStyle} title={`${label} ${destination}`}>
              <span className="fc-edge-label-text">{label}</span>
              <span className="fc-edge-label-target" aria-label={`目标界面：${targetName || "未命名界面"}`}>
                {destination}
              </span>
            </div>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});




