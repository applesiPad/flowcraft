import { memo, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Icon } from "./Icon";
import { EditorContext, ScreenView } from "./ScreenView";
import type { DecisionData, NoteData, ScreenData } from "./types";

export const ScreenNode = memo(function ScreenNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ScreenData;
  const { showHotspots, walkMode, zoom, freezeLayout, moveElement, resizeElement, walkHotspot, unlinkedHotspotKeys } = useContext(EditorContext);
  const show = selected || showHotspots;

  return (
    <div className={`fc-node fc-node-screen${selected ? " is-selected" : ""}${walkMode ? " is-walk-node" : ""}`}>
      <div className="fc-node-badge">界面</div>
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
              style={{ top: "50%" }}
              isConnectable
            />
          ) : null
        }
      />
      <Handle id="in" type="target" position={Position.Left} className="fc-handle fc-handle-target" />
    </div>
  );
});

export const DecisionNode = memo(function DecisionNode({ data, selected }: NodeProps) {
  const d = data as unknown as DecisionData;
  return (
    <div className={`fc-node fc-node-decision${selected ? " is-selected" : ""}`}>
      <div className="fc-decision-head">
        <span className="fc-decision-icon"><Icon name="diamond" size={15} /></span>
        <span>{d.title}</span>
      </div>
      <div className="fc-decision-hint">条件分支</div>
      <Handle id="in" type="target" position={Position.Left} className="fc-handle fc-handle-target" />
      <Handle id="yes" type="source" position={Position.Right} className="fc-handle fc-handle-yes" />
      <Handle id="no" type="source" position={Position.Bottom} className="fc-handle fc-handle-no" />
      <span className="fc-handle-label fc-handle-label-yes">是</span>
      <span className="fc-handle-label fc-handle-label-no">否</span>
    </div>
  );
});

export const ActionNode = memo(function ActionNode({ data, selected }: NodeProps) {
  const d = data as unknown as { title: string; subtitle?: string };
  return (
    <div className={`fc-node fc-node-action${selected ? " is-selected" : ""}`}>
      <span className="fc-action-icon"><Icon name="bolt" size={16} /></span>
      <div>
        <div className="fc-action-title">{d.title}</div>
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