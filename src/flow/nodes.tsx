import { memo, useContext, type MouseEvent as ReactMouseEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Icon } from "./Icon";
import { InlineTitle } from "./InlineTitle.tsx";
import { EditorContext, ScreenView } from "./ScreenView";
import { handleColorOf } from "./edgeColors";
import type { DecisionData, NoteData, ScreenData } from "./types";

export const ScreenNode = memo(function ScreenNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ScreenData;
  const { showHotspots, walkMode, zoom, freezeLayout, moveElement, resizeElement, walkHotspot, unlinkedHotspotKeys, deadHints } = useContext(EditorContext);
  const show = selected || showHotspots;
  // §8-1 死路提示：主按钮没接线 / 完全没有出口时，编辑期直接在卡片上暴露（走查模式除外）
  const hint = walkMode ? undefined : deadHints?.get(id);
  const dead = !!hint && (!hint.hasOut || hint.unwiredPrimary > 0);

  return (
    <div className={`fc-node fc-node-screen${selected ? " is-selected" : ""}${walkMode ? " is-walk-node" : ""}${dead ? " is-dead-hint" : ""}`}>
      <div className="fc-node-badge">界面</div>
      {dead ? (
        <div
          className="fc-dead-badge"
          title={hint!.unwiredPrimary > 0 ? `${hint!.unwiredPrimary} 个主按钮还没接线` : "这张界面没有出口连线"}
          aria-label={hint!.unwiredPrimary > 0 ? `${hint!.unwiredPrimary} 个主按钮还没接线` : "这张界面没有出口连线"}
        >
          {hint!.unwiredPrimary > 0 ? hint!.unwiredPrimary : "无出口"}
        </div>
      ) : null}
      {/* Figma 式自由起线区：贴着卡片边缘的透明条，抓住即从该卡发起连线。
          渲染在 ScreenView 之前，可见的连接点在其上层、优先命中。
          左侧留给入口锚点，不设起线区；走查模式下停用。 */}
      {!walkMode
        ? (["top", "right", "bottom"] as const).map((side) => (
            <Handle
              key={side}
              id={`free-${side}`}
              type="source"
              position={side === "top" ? Position.Top : side === "right" ? Position.Right : Position.Bottom}
              className="fc-handle-free"
              isConnectable
            />
          ))
        : null}
      <ScreenView
        data={d}
        nodeId={id}
        nodeSelected={show}
        interactive={!!selected && !walkMode}
        walkMode={walkMode}
        zoom={zoom}
        onFreezeLayout={(boxes) => freezeLayout?.(id, boxes)}
        onMoveElement={(elId, box) => moveElement?.(id, elId, box)}
        onResizeElement={(elId, box) => resizeElement?.(id, elId, box)}
        onWalkHotspot={(elId) => walkHotspot?.(id, elId)}
        unlinkedHotspotKeys={unlinkedHotspotKeys}
        renderHandle={(el) =>
          show && !walkMode ? (
            <Handle
              id={el.id}
              type="source"
              position={Position.Right}
              className="fc-handle fc-handle-hotspot"
              style={{ top: "50%", background: handleColorOf(el.id) }}
              isConnectable
            />
          ) : null
        }
      />
      <Handle id="in" type="target" position={Position.Left} className="fc-handle fc-handle-target" />
    </div>
  );
});

export const DecisionNode = memo(function DecisionNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as DecisionData;
  /** §8-3 药丸点击起线：在隐藏的源 Handle 上派发一次 mousedown（React Flow 的 Handle
      实际监听 onMouseDown，并在 doc 级挂 mousemove/mouseup）——随后用户的真实鼠标移动
      会接管连线，点目标卡片松手即由 onConnectEnd 的「落卡兜底」接到它的入口锚点，
      两次点击完成分支连线。 */
  const startConnect = (handleId: "yes" | "no", event: ReactMouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const host = (event.currentTarget as Element).closest(".react-flow__node");
    const handle = host?.getAttribute("data-id") === id ? host.querySelector<HTMLElement>(`.fc-handle-${handleId}`) : null;
    if (!handle) return;
    const r = handle.getBoundingClientRect();
    handle.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: 1,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      }),
    );
  };
  return (
    <div className={`fc-node fc-node-decision${selected ? " is-selected" : ""}`}>
      <div className="fc-decision-head">
        <span className="fc-decision-icon"><Icon name="diamond" size={15} /></span>
        <InlineTitle nodeId={id} value={d.title} />
      </div>
      <div className="fc-decision-hint">条件分支</div>
      <Handle id="in" type="target" position={Position.Left} className="fc-handle fc-handle-target" />
      <Handle id="yes" type="source" position={Position.Right} className="fc-handle fc-handle-yes" style={{ background: handleColorOf("yes") }} />
      <Handle id="no" type="source" position={Position.Bottom} className="fc-handle fc-handle-no" style={{ background: handleColorOf("no") }} />
      <span
        className="fc-handle-label fc-handle-label-yes is-clickable"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => startConnect("yes", e)}
        title="点击后，再点目标卡片即可完成「是」分支连线"
      >是</span>
      <span
        className="fc-handle-label fc-handle-label-no is-clickable"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => startConnect("no", e)}
        title="点击后，再点目标卡片即可完成「否」分支连线"
      >否</span>
    </div>
  );
});

export const ActionNode = memo(function ActionNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as { title: string; subtitle?: string };
  return (
    <div className={`fc-node fc-node-action${selected ? " is-selected" : ""}`}>
      <span className="fc-action-icon"><Icon name="bolt" size={16} /></span>
      <div>
        <div className="fc-action-title">
          <InlineTitle nodeId={id} value={d.title} />
        </div>
        {d.subtitle ? <div className="fc-action-sub">{d.subtitle}</div> : null}
      </div>
      <Handle id="in" type="target" position={Position.Left} className="fc-handle fc-handle-target" />
      <Handle id="out" type="source" position={Position.Right} className="fc-handle" />
    </div>
  );
});

export const NoteNode = memo(function NoteNode({ data, selected }: NodeProps) {
  const d = data as unknown as NoteData;
  const hasTarget = typeof d.anchor?.nodeId === "string" && d.anchor.nodeId.length > 0;
  const side = d.anchor?.side === "bottom" ? "bottom" : "right";
  return (
    <div className={`fc-node fc-node-note is-${d.tone ?? "note"}${selected ? " is-selected" : ""}${hasTarget ? " is-anchored" : ""}`}>
      <span className={`fc-note-pointer is-${side}`} aria-hidden="true" />
      <div className="fc-note-head">
        <span className="fc-note-icon"><Icon name="note" size={16} /></span>
        <div className="fc-note-copy">
          <span className="fc-note-kicker">交互备注 · {hasTarget ? "已关联" : "未关联"}</span>
          <div className="fc-note-title">{d.title}</div>
        </div>
        {hasTarget ? <span className="fc-note-target"><Icon name="link" size={12} />关联</span> : null}
      </div>
      {d.body ? <div className="fc-note-body">{d.body}</div> : null}
      <div className="fc-note-meta">
        {hasTarget ? "随目标界面移动" : "在属性面板选择关联界面"}
      </div>
    </div>
  );
});