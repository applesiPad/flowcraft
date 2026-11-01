import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import {
  clampMoveBox,
  clampResizeBox,
  DEFAULT_ELEMENT_REGION,
  regionForContainer,
  resizeBox,
  snapDelta,
  type AlignGuide,
  type AlignGuideInput,
  type ContainerRegion,
  type ResizeHandlePos,
} from "./elementEditor";
import type { ElementBox, ScreenData, ScreenElement } from "./types";

const RESIZE_HANDLES: { pos: ResizeHandlePos; cls: string; cursor: string }[] = [
  { pos: "nw", cls: "fc-rz-nw", cursor: "nwse-resize" },
  { pos: "n", cls: "fc-rz-n", cursor: "ns-resize" },
  { pos: "ne", cls: "fc-rz-ne", cursor: "nesw-resize" },
  { pos: "e", cls: "fc-rz-e", cursor: "ew-resize" },
  { pos: "se", cls: "fc-rz-se", cursor: "nwse-resize" },
  { pos: "s", cls: "fc-rz-s", cursor: "ns-resize" },
  { pos: "sw", cls: "fc-rz-sw", cursor: "nesw-resize" },
  { pos: "w", cls: "fc-rz-w", cursor: "ew-resize" },
];

export type EditorCtx = {
  showHotspots: boolean;
  walkMode: boolean;
  zoom: number;
  /** 首次拖动元素时，把竖排布局固化为绝对坐标 */
  freezeLayout?: (nodeId: string, boxes: Record<string, ElementBox>) => void;
  moveElement?: (nodeId: string, elId: string, box: ElementBox) => void;
  resizeElement?: (nodeId: string, elId: string, box: ElementBox) => void;
  /** 走查模式点热点 */
  walkHotspot?: (nodeId: string, elId: string) => void;
  /** 编辑期未配置跳转的热点，key 为 nodeId:elId */
  unlinkedHotspotKeys?: ReadonlySet<string>;
};

export const EditorContext = createContext<EditorCtx>({ showHotspots: true, walkMode: false, zoom: 1 });

function Chevron() {
  return <span className="fc-chevron">›</span>;
}

function renderElement(el: ScreenElement, preview: boolean) {
  switch (el.kind) {
    case "logo":
      return (
        <div className="fc-logo">
          <div className="fc-logo-mark">
            <Icon name={el.icon} size={24} fallback="✦" />
          </div>
          <div className="fc-logo-title">{el.label}</div>
          {el.sublabel ? <div className="fc-logo-sub">{el.sublabel}</div> : null}
        </div>
      );
    case "banner":
      return (
        <div className="fc-banner">
          <div className="fc-banner-title">{el.label}</div>
          <div className="fc-banner-sub">{el.sublabel}</div>
        </div>
      );
    case "search":
      return (
        <div className="fc-search">
          <span className="fc-search-icon">
            <Icon name="search" size={13} />
          </span>
          <span className="fc-search-ph">{el.placeholder ?? "搜索"}</span>
        </div>
      );
    case "input":
      return (
        <div className="fc-input">
          {el.label ? <div className="fc-input-label">{el.label}</div> : null}
          <div className="fc-input-field">
            <span className="fc-input-ph">{el.placeholder ?? "请输入"}</span>
            {preview ? <span className="fc-caret" /> : null}
          </div>
        </div>
      );
    case "button":
      return <div className={`fc-button fc-button-${el.tone ?? "primary"}`}>{el.label}</div>;
    case "list-item":
      return (
        <div className="fc-list-item">
          <div className="fc-list-icon">
            <Icon name={el.icon} size={15} fallback="•" />
          </div>
          <div className="fc-list-text">
            <div className="fc-list-title">{el.label}</div>
            {el.sublabel ? <div className="fc-list-sub">{el.sublabel}</div> : null}
          </div>
          <Chevron />
        </div>
      );
    case "card":
      return (
        <div className="fc-card">
          <div className="fc-card-cover">
            <Icon name={el.icon ?? "image"} size={26} />
          </div>
          <div className="fc-card-body">
            <div className="fc-card-title">{el.label}</div>
            {el.sublabel ? <div className="fc-card-sub">{el.sublabel}</div> : null}
          </div>
        </div>
      );
    case "avatar":
      return (
        <div className="fc-avatar-row">
          <div className="fc-avatar">{el.label?.slice(0, 1) ?? "A"}</div>
          <div>
            <div className="fc-list-title">{el.label}</div>
            {el.sublabel ? <div className="fc-list-sub">{el.sublabel}</div> : null}
          </div>
        </div>
      );
    case "toggle":
      return (
        <div className="fc-toggle-row">
          <span>{el.label}</span>
          <span className="fc-switch" />
        </div>
      );
    case "text":
      return <div className="fc-text">{el.label}</div>;
    case "chip":
      return <div className="fc-chip">{el.label}</div>;
    case "divider":
      return <div className="fc-divider" />;
    case "tabbar":
      return (
        <div className="fc-tabbar">
          {[
            { icon: "grid", label: "工作台", active: true },
            { icon: "compass", label: "发现", active: false },
            { icon: "user", label: "我的", active: false },
          ].map((t) => (
            <div key={t.label} className={`fc-tab${t.active ? " is-active" : ""}`}>
              <span className="fc-tab-icon">
                <Icon name={t.icon} size={15} />
              </span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export type ScreenViewProps = {
  data: ScreenData;
  nodeId?: string;
  /** 预览模式下热点可点击 */
  preview?: boolean;
  onClickHotspot?: (el: ScreenElement) => void;
  /** 编辑模式：给每个热点渲染一个 React Flow Handle */
  renderHandle?: (el: ScreenElement, index: number) => ReactNode;
  nodeSelected?: boolean;
  hotspotLabels?: Record<string, string>;
  /** 选中界面后，元素可直接拖动排版 */
  interactive?: boolean;
  /** 走查模式：点界面里的热点聚焦到目标界面 */
  walkMode?: boolean;
  onWalkHotspot?: (elId: string) => void;
  /** 编辑期未配置跳转的热点，key 为 nodeId:elId */
  unlinkedHotspotKeys?: ReadonlySet<string>;
  /** 首次拖动时把当前竖排布局固化成绝对坐标 */
  onFreezeLayout?: (boxes: Record<string, ElementBox>) => void;
  onMoveElement?: (elId: string, box: ElementBox) => void;
  onResizeElement?: (elId: string, box: ElementBox) => void;
  /** 画布缩放，用于把屏幕像素换算成界面本地像素 */
  zoom?: number;
};

export function ScreenView({
  data,
  nodeId,
  preview = false,
  onClickHotspot,
  renderHandle,
  nodeSelected,
  hotspotLabels,
  interactive = false,
  walkMode = false,
  onWalkHotspot,
  onFreezeLayout,
  unlinkedHotspotKeys,
  onMoveElement,
  onResizeElement,
  zoom = 1,
}: ScreenViewProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ vertical: AlignGuide[]; horizontal: AlignGuide[] }>({ vertical: [], horizontal: [] });
  const elements = data.elements ?? [];
  const free = data.layout === "free";

  /** 把当前 DOM 布局量成绝对坐标（除以画布缩放，得到界面本地像素） */
  const measureAll = useCallback((): Record<string, ElementBox> => {
    const body = bodyRef.current;
    if (!body) return {};
    const bounds = body.getBoundingClientRect();
    const z = zoom > 0 ? zoom : 1;
    const out: Record<string, ElementBox> = {};
    body.querySelectorAll<HTMLElement>("[data-el-id]").forEach((node) => {
      const id = node.dataset.elId;
      if (!id) return;
      const rect = node.getBoundingClientRect();
      out[id] = {
        x: Math.round((rect.left - bounds.left) / z),
        y: Math.round((rect.top - bounds.top) / z),
        w: Math.round(rect.width / z),
        h: Math.round(rect.height / z),
      };
    });
    return out;
  }, [zoom]);

  /** 当前 .fc-body 定位盒 → 界面本地像素的容器区域（自由布局高度可增长，只约束横向与顶部） */
  const currentRegion = useCallback((): ContainerRegion => {
    const body = bodyRef.current;
    if (!body) return DEFAULT_ELEMENT_REGION;
    const bounds = body.getBoundingClientRect();
    return regionForContainer(bounds.width, bounds.height, zoom, true);
  }, [zoom]);

  /** 计算某元素当前位置与其它元素的精确对齐参考线 */
  const guidesForElement = useCallback(
    (moving: AlignGuideInput, others: readonly AlignGuideInput[]) => {
      const v: AlignGuide[] = [];
      const h: AlignGuide[] = [];
      const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
      for (const o of others) {
        if (near(o.x, moving.x)) v.push({ coordinate: o.x, axis: "x" });
        if (near(o.x + o.w, moving.x + moving.w)) v.push({ coordinate: o.x + o.w, axis: "x" });
        if (near(o.x + o.w / 2, moving.x + moving.w / 2)) v.push({ coordinate: o.x + o.w / 2, axis: "cx" });
        if (near(o.y, moving.y)) h.push({ coordinate: o.y, axis: "x" });
        if (near(o.y + o.h, moving.y + moving.h)) h.push({ coordinate: o.y + o.h, axis: "x" });
        if (near(o.y + o.h / 2, moving.y + moving.h / 2)) h.push({ coordinate: o.y + o.h / 2, axis: "cx" });
      }
      return { vertical: v, horizontal: h };
    },
    [],
  );

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, el: ScreenElement) => {
      if (!interactive || preview) return;
      const target = event.target as HTMLElement;
      if (target.closest(".react-flow__handle")) return; // 锚点交给连线逻辑
      event.preventDefault();
      event.stopPropagation();
      const measured = free ? null : measureAll();
      if (measured) onFreezeLayout?.(measured);
      const start = measured?.[el.id] ?? el.box ?? { x: 16, y: 16, w: 288 };
      const ox = event.clientX;
      const oy = event.clientY;
      const z = zoom > 0 ? zoom : 1;
      setDragging(el.id);
      const others: AlignGuideInput[] = elements
        .filter((o) => o.id !== el.id && o.box)
        .map((o) => ({ x: o.box!.x, y: o.box!.y, w: o.box!.w, h: o.box!.h ?? 64 }));
      // 容器区域在拖拽开始时捕获一次：期间宽度与缩放不变，避免每次 move 强制回流
      const region = currentRegion();

      const onMove = (e: PointerEvent) => {
        const rawX = (start.x + (e.clientX - ox) / z) / 4;
        const rawY = (start.y + (e.clientY - oy) / z) / 4;
        const gridX = Math.round(rawX) * 4;
        const gridY = Math.round(rawY) * 4;
        const snapped = snapDelta({ dx: gridX - start.x, dy: gridY - start.y }, { x: gridX, y: gridY, w: start.w, h: start.h ?? 64 }, others, 6);
        const raw: ElementBox = { x: Math.round((start.x + snapped.dx) / 4) * 4, y: Math.round((start.y + snapped.dy) / 4) * 4, w: start.w, h: start.h };
        const clamped = clampMoveBox(raw, region);
        onMoveElement?.(el.id, clamped);
        setGuides(guidesForElement({ x: clamped.x, y: clamped.y, w: clamped.w, h: clamped.h ?? 64 }, others));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setDragging(null);
        setGuides({ vertical: [], horizontal: [] });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [currentRegion, elements, free, guidesForElement, interactive, measureAll, onFreezeLayout, onMoveElement, preview, zoom],
  );

  /** 拖拽方位角把手缩放元素 */
  const beginResize = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>, el: ScreenElement) => {
      if (!interactive || preview) return;
      const target = event.target as HTMLElement;
      if (target.closest(".react-flow__handle")) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = (event.currentTarget as HTMLSpanElement).dataset.pos as ResizeHandlePos | undefined;
      if (!handle || !el.box) return;
      const box = el.box;
      const ox = event.clientX;
      const oy = event.clientY;
      const z = zoom > 0 ? zoom : 1;
      setResizing(el.id);
      const region = currentRegion();
      const onMove = (e: PointerEvent) => {
        const dx = Math.round((e.clientX - ox) / z);
        const dy = Math.round((e.clientY - oy) / z);
        const next = resizeBox(box, handle, dx, dy, { minWidth: 16, minHeight: 12 });
        onResizeElement?.(el.id, clampResizeBox(next, region, { minWidth: 16, minHeight: 12 }));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setResizing(null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [currentRegion, interactive, preview, onResizeElement, zoom],
  );

  const layout = useMemo(() => {
    if (!free) return null;
    const boxes: Record<string, ElementBox> = {};
    let cursor = 16;
    let bottom = 0;
    elements.forEach((el) => {
      const box = el.box ?? { x: 16, y: cursor, w: 288 };
      boxes[el.id] = box;
      const h = box.h ?? 64;
      bottom = Math.max(bottom, box.y + h);
      cursor = Math.max(cursor, box.y + h + 12);
    });
    return { boxes, height: Math.max(420, bottom + 28) };
  }, [elements, free]);

  const highlights = !preview && (nodeSelected || false);

  return (
    <div className={`fc-screen${preview ? " is-preview" : ""}${free ? " is-free" : ""}`}>
      <div className="fc-statusbar">
        <span>9:41</span>
        <span className="fc-status-right">
          <span className="fc-sig" />
          <span className="fc-sig" />
          <span className="fc-batt" />
        </span>
      </div>
      <div className="fc-navbar">
        <span className="fc-nav-back">‹</span>
        <span className="fc-nav-title">{data.title}</span>
        <span className="fc-nav-more">⋯</span>
      </div>
      <div ref={bodyRef} className={`fc-body${free ? " is-free" : ""}`} style={layout ? { height: layout.height } : undefined}>
        {guides.vertical.map((g, gi) => (
          <span key={`v-${gi}`} className="fc-guide fc-guide-v" style={{ left: g.coordinate }} />
        ))}
        {guides.horizontal.map((g, hi) => (
          <span key={`h-${hi}`} className="fc-guide fc-guide-h" style={{ top: g.coordinate }} />
        ))}
        {elements.map((el, i) => {
          const box = layout?.boxes[el.id];
          const style = box ? { position: "absolute" as const, left: box.x, top: box.y, width: box.w } : undefined;
          const baseClass = `${dragging === el.id ? " is-dragging" : ""}${resizing === el.id ? " is-resizing" : ""}${interactive ? " is-draggable" : ""}`;

          if (el.hotspot) {
            const unlinked = !preview && !walkMode && !!unlinkedHotspotKeys?.has(`${nodeId ?? ""}:${el.id}`);
            return (
              <div
                key={el.id}
                data-el-id={el.id}
                data-el-kind={el.kind}
                className={`fc-hotspot${highlights ? " is-highlight" : ""}${preview ? " is-clickable" : ""}${walkMode ? " is-walkable" : ""}${unlinked ? " is-unlinked" : ""}${baseClass} fc-hotspot-${el.kind}`}
                style={style}
                onPointerDown={(e) => beginDrag(e, el)}
                onClick={(e) => {
                  if (preview) {
                    e.stopPropagation();
                    onClickHotspot?.(el);
                    return;
                  }
                  if (walkMode) {
                    e.stopPropagation();
                    onWalkHotspot?.(el.id);
                  }
                }}
                title={interactive && !preview ? (unlinked ? "热点未配置跳转：把右侧圆点拖到目标界面" : "拖动可自由排版") : undefined}
              >
                {renderElement(el, preview)}
                {preview && hotspotLabels?.[el.id] ? <span className="fc-hotspot-tag">{hotspotLabels[el.id]}</span> : null}
                {!preview && highlights ? <span className="fc-hotspot-pin" /> : null}
                {unlinked ? <span className="fc-hotspot-warning" aria-label="未配置跳转">!</span> : null}
                {renderHandle ? renderHandle(el, i) : null}
                {interactive && !preview && box ? RESIZE_HANDLES.map((h) => (
                  <span
                    key={h.pos}
                    className={`fc-rz nodrag ${h.cls}`}
                    data-pos={h.pos}
                    style={{ cursor: h.cursor }}
                    onPointerDown={(e) => beginResize(e, el)}
                  />
                )) : null}
              </div>
            );
          }

          return (
            <div
              key={el.id}
              data-el-id={el.id}
              data-el-kind={el.kind}
              className={`fc-static${baseClass}`}
              style={style}
              onPointerDown={(e) => beginDrag(e, el)}
              title={interactive && !preview ? "拖动可自由排版" : undefined}
            >
              {renderElement(el, preview)}
              {interactive && !preview && box ? RESIZE_HANDLES.map((h) => (
                <span
                  key={h.pos}
                  className={`fc-rz nodrag ${h.cls}`}
                  data-pos={h.pos}
                  style={{ cursor: h.cursor }}
                  onPointerDown={(e) => beginResize(e, el)}
                />
              )) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
