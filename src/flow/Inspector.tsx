import { useState } from "react";
import type { ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import { createAnnotation, getAnnotationsByTarget } from "./annotations";
import type { Annotation, AnnotationColor, AnnotationTargetType } from "./annotations";
import type { DecisionData, NoteAnchorSide, NoteData, ScreenData, ScreenElement } from "./types";
import { normalizeEdgeRouteMode } from "./edgeRouting";
import { clampMoveBox, clampResizeBox, DEFAULT_ELEMENT_REGION } from "./elementEditor";

/** 属性面板的数字输入以界面本地像素为单位（zoom=1 视角下的默认内容区） */
const EL_REGION = DEFAULT_ELEMENT_REGION;

const elementKinds: { kind: ScreenElement["kind"]; label: string }[] = [
  { kind: "button", label: "按钮" },
  { kind: "input", label: "输入框" },
  { kind: "list-item", label: "列表项" },
  { kind: "card", label: "卡片" },
  { kind: "search", label: "搜索框" },
  { kind: "tabbar", label: "底部导航" },
  { kind: "toggle", label: "开关" },
  { kind: "banner", label: "横幅" },
  { kind: "text", label: "文本" },
  { kind: "logo", label: "Logo 区" },
  { kind: "divider", label: "分隔线" },
];

const annotationColors: { color: AnnotationColor; label: string }[] = [
  { color: "yellow", label: "黄色" },
  { color: "blue", label: "蓝色" },
  { color: "green", label: "绿色" },
  { color: "red", label: "红色" },
];

const anchorSides: { value: NoteAnchorSide; label: string }[] = [
  { value: "right", label: "右侧" },
  { value: "bottom", label: "底部" },
];

const annotationPanelStyles = `
.fc-annotations {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.fc-annotation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
}

.fc-annotation-heading .fc-panel-subtitle {
  margin: 0;
}

.fc-annotation-count {
  min-width: 21px;
  height: 19px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 1px solid var(--fc-border);
  border-radius: 999px;
  color: #aab2c6;
  background: rgba(109, 124, 255, 0.08);
  font-size: 10.5px;
  font-weight: 600;
}

.fc-annotation-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 9px;
}

.fc-annotation-card {
  position: relative;
  overflow: hidden;
  padding: 9px 10px 8px 13px;
  background: #0e1218;
  border: 1px solid var(--fc-border);
  border-radius: 9px;
}

.fc-annotation-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--fc-annotation-accent);
}

.fc-annotation-card[data-color="yellow"] { --fc-annotation-accent: #e8b84b; }
.fc-annotation-card[data-color="blue"] { --fc-annotation-accent: #60a5fa; }
.fc-annotation-card[data-color="green"] { --fc-annotation-accent: #4ade80; }
.fc-annotation-card[data-color="red"] { --fc-annotation-accent: #fb7185; }

.fc-annotation-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.fc-annotation-content {
  min-width: 0;
  margin: 0;
  color: #d7ddeb;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.fc-annotation-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-top: 5px;
  color: var(--fc-muted);
  font-size: 10.5px;
  line-height: 1.4;
}

.fc-annotation-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
}

.fc-annotation-actions button {
  min-width: 34px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: #9aa3b8;
  background: transparent;
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.fc-annotation-actions button:hover {
  color: #dfe3ff;
  background: rgba(109, 124, 255, 0.12);
  border-color: rgba(109, 124, 255, 0.3);
}

.fc-annotation-actions button[data-action="delete"]:hover {
  color: #ffb4c0;
  background: rgba(251, 113, 133, 0.12);
  border-color: rgba(251, 113, 133, 0.3);
}

.fc-annotation-empty {
  margin: 0 0 9px;
  padding: 10px;
  border: 1px dashed rgba(148, 163, 184, 0.2);
  border-radius: 9px;
  color: var(--fc-muted);
  background: rgba(148, 163, 184, 0.035);
  font-size: 11.5px;
  line-height: 1.65;
}

.fc-annotation-empty strong {
  display: block;
  margin-bottom: 2px;
  color: #c6cddd;
  font-size: 12px;
  font-weight: 600;
}

.fc-annotation-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--fc-border);
  border-radius: 9px;
  background: #0e1218;
}

.fc-annotation-editor textarea {
  width: 100%;
  min-height: 62px;
  padding: 7px 8px;
  resize: vertical;
  color: var(--fc-text);
  background: #0a0d12;
  border: 1px solid var(--fc-border);
  border-radius: 7px;
  outline: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
}

.fc-annotation-editor textarea:focus {
  border-color: rgba(109, 124, 255, 0.7);
  box-shadow: 0 0 0 3px rgba(109, 124, 255, 0.12);
}

.fc-annotation-editor textarea::placeholder {
  color: #687187;
}

.fc-annotation-editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.fc-annotation-colors {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fc-annotation-color {
  width: 21px;
  height: 21px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--fc-swatch);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16);
  cursor: pointer;
}

.fc-annotation-color[data-color="yellow"] { --fc-swatch: #e8b84b; }
.fc-annotation-color[data-color="blue"] { --fc-swatch: #60a5fa; }
.fc-annotation-color[data-color="green"] { --fc-swatch: #4ade80; }
.fc-annotation-color[data-color="red"] { --fc-swatch: #fb7185; }

.fc-annotation-color:hover {
  transform: scale(1.08);
}

.fc-annotation-color[aria-pressed="true"] {
  border-color: #f8fafc;
  box-shadow: 0 0 0 2px rgba(248, 250, 252, 0.16);
}

.fc-annotation-editor-foot .fc-btn {
  height: 29px;
  padding: 0 9px;
  font-size: 11px;
}

.fc-annotation-hint {
  margin: 0;
  color: #737d92;
  font-size: 10.5px;
  line-height: 1.45;
}

.fc-inspector-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fc-inspector-group {
  overflow: hidden;
  border: 1px solid var(--fc-border);
  border-radius: 10px;
  background: rgba(13, 16, 22, 0.34);
}

.fc-inspector-group > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 42px;
  padding: 0 11px;
  color: #d6dce9;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.fc-inspector-group > summary::-webkit-details-marker {
  display: none;
}

.fc-inspector-group > summary:hover {
  background: rgba(148, 163, 184, 0.055);
}

.fc-inspector-group > summary:focus-visible {
  outline: 2px solid rgba(109, 124, 255, 0.72);
  outline-offset: -2px;
}

.fc-inspector-group[open] > summary {
  border-bottom: 1px solid var(--fc-border);
  background: rgba(109, 124, 255, 0.055);
}

.fc-inspector-group-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.fc-inspector-group-mark {
  width: 5px;
  height: 15px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--fc-accent);
  opacity: 0.9;
}

.fc-inspector-group-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--fc-muted);
  font-size: 10.5px;
  font-weight: 400;
}

.fc-inspector-chevron {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  transition: transform 140ms ease;
}

.fc-inspector-group[open] .fc-inspector-chevron {
  transform: rotate(180deg);
}

.fc-inspector-group-body {
  padding: 11px;
}

.fc-inspector-group-body > :last-child {
  margin-bottom: 0;
}

.fc-inspector-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.fc-inspector-fields > .fc-field {
  min-width: 0;
  margin-bottom: 0;
}

.fc-inspector-fields > .fc-field select {
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  color: var(--fc-text);
  background: #0e1218;
  border: 1px solid var(--fc-border);
  border-radius: 8px;
  outline: none;
  font: inherit;
  font-size: 12.5px;
}

.fc-inspector-fields > .fc-field select:focus {
  border-color: rgba(109, 124, 255, 0.7);
  box-shadow: 0 0 0 3px rgba(109, 124, 255, 0.14);
}

.fc-inspector-fields > .fc-field select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.fc-inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.fc-inspector-actions .fc-btn {
  height: 30px;
  padding: 0 9px;
  font-size: 11px;
}

.fc-inspector-note {
  margin: 0;
  color: var(--fc-muted);
  font-size: 11.5px;
  line-height: 1.65;
}

.fc-inspector-relation {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 10px;
  margin-bottom: 10px;
  border: 1px solid rgba(109, 124, 255, 0.24);
  border-radius: 8px;
  color: #cbd3e5;
  background: rgba(109, 124, 255, 0.065);
  font-size: 11.5px;
  line-height: 1.55;
}

.fc-inspector-relation svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.fc-inspector-divider {
  height: 1px;
  margin: 11px 0;
  background: var(--fc-border);
}

.fc-inspector-empty {
  min-height: 320px;
}

.fc-inspector-empty-card {
  padding: 16px;
  border: 1px dashed var(--fc-border-strong);
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.035);
}

.fc-inspector-empty-card strong {
  display: block;
  margin-bottom: 5px;
  color: #d6dce9;
  font-size: 12px;
  font-weight: 650;
}

.fc-inspector-empty-card p {
  margin: 0;
  color: var(--fc-muted);
  font-size: 11.5px;
  line-height: 1.65;
}

.fc-inspector-empty-card p + p {
  margin-top: 8px;
}

.fc-inspector-empty-card b {
  color: #cbd3e5;
  font-weight: 600;
}

.fc-inspector-note-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 11px;
  border: 1px dashed var(--fc-border);
  border-radius: 9px;
  color: var(--fc-muted);
  background: rgba(148, 163, 184, 0.03);
  font-size: 11.5px;
  line-height: 1.6;
}

.fc-inspector-note-block strong {
  color: #cbd3e5;
  font-size: 11.5px;
  font-weight: 650;
}

@media (prefers-reduced-motion: reduce) {
  .fc-inspector-chevron {
    transition: none;
  }
}
`;

type Props = {
  node?: Node;
  edge?: Edge;
  nodes: Node[];
  annotations?: Annotation[];
  onAddAnnotation?: (annotation: Annotation) => void;
  onUpdateAnnotation?: (annotation: Annotation) => void;
  onDeleteAnnotation?: (id: string) => void;
  onPatchNodeData: (id: string, patch: Record<string, unknown>, historyKey?: string) => void;
  onPatchScreen: (id: string, patch: Partial<ScreenData>, historyKey?: string) => void;
  onPatchElement: (nodeId: string, elId: string, patch: Partial<ScreenElement>, historyKey?: string) => void;
  onAddElement: (nodeId: string, kind: ScreenElement["kind"]) => void;
  onRemoveElement: (nodeId: string, elId: string) => void;
  onReorderElement?: (nodeId: string, elId: string, action: "bring-to-front" | "send-to-back" | "bring-forward" | "send-backward") => void;
  onPatchEdge: (
    id: string,
    patch: { label?: string; routeMode?: "auto" | "top" | "bottom"; sourceHandle?: string },
    historyKey?: string,
  ) => void;
  onCreateLink: (nodeId: string, hotspotId: string, targetNodeId: string) => void;
  onResetLayout: (nodeId: string) => void;
  onSaveTemplate: (nodeId: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeleteNode: (id: string) => void;
};

function nodeTitle(node: Node): string {
  const data = node.data as Record<string, unknown>;
  return typeof data.title === "string" && data.title.trim() ? data.title : node.id;
}

function nodeKindLabel(type: Node["type"]): string {
  switch (type) {
    case "screen":
      return "界面";
    case "decision":
      return "判断";
    case "action":
      return "系统动作";
    case "note":
      return "备注";
    default:
      return "节点";
  }
}

function InspectorSection({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="fc-inspector-group" open={defaultOpen}>
      <summary>
        <span className="fc-inspector-group-label">
          <span className="fc-inspector-group-mark" aria-hidden="true" />
          <span>{title}</span>
        </span>
        <span className="fc-inspector-group-meta">
          {meta ? <span>{meta}</span> : null}
          <svg
            className="fc-inspector-chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m7 9 5 5 5-5" />
          </svg>
        </span>
      </summary>
      <div className="fc-inspector-group-body">{children}</div>
    </details>
  );
}

function formatAnnotationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function AnnotationEditor({
  initialContent,
  initialColor,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialContent: string;
  initialColor: AnnotationColor;
  submitLabel: string;
  onSubmit: (content: string, color: AnnotationColor) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [color, setColor] = useState<AnnotationColor>(initialColor);
  const canSubmit = content.trim().length > 0;

  return (
    <div className="fc-annotation-editor">
      <textarea
        aria-label="批注内容"
        value={content}
        placeholder="写下修改建议、验收标准或待确认问题…"
        maxLength={2000}
        autoFocus
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit(content, color);
          }
          if (event.key === "Escape") onCancel();
        }}
      />
      <div className="fc-annotation-editor-foot">
        <div className="fc-annotation-colors" role="group" aria-label="批注颜色">
          {annotationColors.map((item) => (
            <button
              key={item.color}
              type="button"
              className="fc-annotation-color"
              data-color={item.color}
              aria-label={item.label}
              aria-pressed={color === item.color}
              title={item.label}
              onClick={() => setColor(item.color)}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button type="button" className="fc-btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="fc-btn fc-btn-primary" disabled={!canSubmit} onClick={() => onSubmit(content, color)}>
            {submitLabel}
          </button>
        </div>
      </div>
      <p className="fc-annotation-hint">Ctrl/⌘ + Enter 保存 · Esc 取消</p>
    </div>
  );
}

function AnnotationPanel({
  targetType,
  targetId,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  annotations?: Annotation[];
  onAddAnnotation?: (annotation: Annotation) => void;
  onUpdateAnnotation?: (annotation: Annotation) => void;
  onDeleteAnnotation?: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const targetAnnotations = annotations
    ? getAnnotationsByTarget(annotations, targetType, targetId).reverse()
    : [];
  const isConnected = Boolean(annotations && onAddAnnotation && onUpdateAnnotation && onDeleteAnnotation);

  return (
    <section className="fc-annotations" aria-label="批注">
      <div className="fc-annotation-heading">
        <div className="fc-panel-subtitle">
          批注 <span className="fc-muted">修改意见与待办</span>
        </div>
        <span className="fc-annotation-count">{targetAnnotations.length}</span>
      </div>

      {!isConnected ? (
        <p className="fc-annotation-empty">
          <strong>批注功能尚未连接</strong>
          接入批注数据后，可在这里添加、编辑和删除当前目标的批注。
        </p>
      ) : null}

      {targetAnnotations.length ? (
        <div className="fc-annotation-list">
          {targetAnnotations.map((annotation) => (
            <article key={annotation.id} className="fc-annotation-card" data-color={annotation.color}>
              {editingId === annotation.id ? (
                <AnnotationEditor
                  key={annotation.id}
                  initialContent={annotation.content}
                  initialColor={annotation.color}
                  submitLabel="保存"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(content, color) => {
                    onUpdateAnnotation?.({ ...annotation, content: content.trim(), color, updatedAt: new Date().toISOString() });
                    setEditingId(null);
                  }}
                />
              ) : (
                <>
                  <div className="fc-annotation-card-head">
                    <p className="fc-annotation-content">{annotation.content}</p>
                    <div className="fc-annotation-actions">
                      <button type="button" data-action="edit" onClick={() => { setEditingId(annotation.id); setPendingDeleteId(null); }}>
                        编辑
                      </button>
                      <button type="button" data-action="delete" onClick={() => setPendingDeleteId(annotation.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="fc-annotation-meta">
                    <span>{annotation.author ?? "匿名"}</span>
                    <span>更新于 {formatAnnotationTime(annotation.updatedAt)}</span>
                  </div>
                  {pendingDeleteId === annotation.id ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7 }}>
                      <span style={{ color: "#ffb4c0", fontSize: 10.5 }}>确定删除这条批注？</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button type="button" className="fc-chip-btn" onClick={() => setPendingDeleteId(null)}>
                          取消
                        </button>
                        <button
                          type="button"
                          className="fc-chip-btn"
                          style={{ color: "#ffb4c0", borderColor: "rgba(251, 113, 133, 0.35)" }}
                          onClick={() => {
                            onDeleteAnnotation?.(annotation.id);
                            setPendingDeleteId(null);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          ))}
        </div>
      ) : isConnected ? (
        <p className="fc-annotation-empty">
          <strong>还没有批注</strong>
          为当前{targetType === "node" ? "节点" : "连线"}留下第一条修改意见。
        </p>
      ) : null}

      {adding ? (
        <AnnotationEditor
          initialContent=""
          initialColor="yellow"
          submitLabel="添加"
          onCancel={() => setAdding(false)}
          onSubmit={(content, color) => {
            onAddAnnotation?.(
              createAnnotation({
                targetType,
                targetId,
                content,
                color,
              }),
            );
            setAdding(false);
          }}
        />
      ) : isConnected ? (
        <button
          type="button"
          className="fc-btn fc-btn-wide"
          disabled={adding || editingId !== null}
          onClick={() => {
            setAdding(true);
            setPendingDeleteId(null);
          }}
        >
          + 添加批注
        </button>
      ) : null}
    </section>
  );
}

function LinkBuilder({
  nodeId,
  screen,
  nodes,
  onCreateLink,
}: {
  nodeId: string;
  screen: ScreenData;
  nodes: Node[];
  onCreateLink: (nodeId: string, hotspotId: string, targetNodeId: string) => void;
}) {
  const [hs, setHs] = useState("");
  const [tg, setTg] = useState("");
  const hotspots = screen.elements.filter((e) => e.hotspot);
  const targets = nodes.filter((n) => n.id !== nodeId);

  return (
    <div className="fc-link-builder">
      <p className="fc-inspector-note">先选可点击热点，再选择跳转目标。</p>
      <select aria-label="选择跳转热点" value={hs} onChange={(e) => setHs(e.target.value)}>
        <option value="">选择热点…</option>
        {hotspots.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label ?? e.action ?? e.id}
          </option>
        ))}
      </select>
      <span className="fc-link-arrow" aria-hidden="true">↓</span>
      <select aria-label="选择跳转目标" value={tg} onChange={(e) => setTg(e.target.value)}>
        <option value="">目标节点…</option>
        {targets.map((n) => (
          <option key={n.id} value={n.id}>
            {nodeTitle(n)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="fc-btn"
        disabled={!hs || !tg}
        onClick={() => {
          onCreateLink(nodeId, hs, tg);
          setHs("");
          setTg("");
        }}
      >
        建立连线
      </button>
    </div>
  );
}

function annotationCountFor(annotations: Annotation[] | undefined, targetType: AnnotationTargetType, targetId: string): number {
  return annotations ? getAnnotationsByTarget(annotations, targetType, targetId).length : 0;
}

export function Inspector(props: Props) {
  const { node, edge, nodes } = props;
  const annotationProps = {
    annotations: props.annotations,
    onAddAnnotation: props.onAddAnnotation,
    onUpdateAnnotation: props.onUpdateAnnotation,
    onDeleteAnnotation: props.onDeleteAnnotation,
  };

  if (edge) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    const srcData = sourceNode?.data as unknown as ScreenData | undefined;
    const hotspot = srcData?.elements?.find((e) => e.id === edge.sourceHandle);
    const hotspots = srcData?.elements?.filter((element) => element.hotspot) ?? [];
    const routeMode = normalizeEdgeRouteMode((edge.data as { routeMode?: unknown } | undefined)?.routeMode);
    const annotationCount = annotationCountFor(props.annotations, "edge", edge.id);
    return (
      <div className="fc-inspector" data-inspector-kind="edge">
        <style>{annotationPanelStyles}</style>
        <div className="fc-panel-title">连线属性</div>
        <div className="fc-inspector-groups">
          <InspectorSection title="基本信息" meta="触发文案" defaultOpen>
            <div className="fc-inspector-fields">
              <label className="fc-field">
                <span>触发文案</span>
                <input
                  value={(edge.data?.label as string) ?? ""}
                  placeholder="例如：点击「登录」"
                  onChange={(e) => props.onPatchEdge(edge.id, { label: e.target.value }, `edge:${edge.id}:label`)}
                />
              </label>
              <label className="fc-field">
                <span>出发热点</span>
                <select
                  value={edge.sourceHandle ?? ""}
                  onChange={(e) => props.onPatchEdge(edge.id, { sourceHandle: e.target.value }, `edge:${edge.id}:source`)}
                >
                  {hotspots.length ? (
                    hotspots.map((element) => (
                      <option key={element.id} value={element.id}>
                        {element.label ?? element.action ?? element.id}
                      </option>
                    ))
                  ) : (
                    <option value={edge.sourceHandle ?? ""}>{hotspot?.label ?? hotspot?.action ?? edge.sourceHandle ?? "—"}</option>
                  )}
                </select>
              </label>
              <label className="fc-field">
                <span>线路走向</span>
                <select
                  value={routeMode}
                  onChange={(e) =>
                    props.onPatchEdge(
                      edge.id,
                      { routeMode: normalizeEdgeRouteMode(e.target.value) },
                      `edge:${edge.id}:route`,
                    )
                  }
                >
                  <option value="auto">自动 · 智能平衡</option>
                  <option value="top">手动 · 走上通道</option>
                  <option value="bottom">手动 · 走下通道</option>
                </select>
              </label>
            </div>
            <p className="fc-inspector-note">自动模式在近距离闭环和远距离回退之间平衡长度与交叉；上 / 下通道用于把交叉线手动分流。</p>
            <div className="fc-inspector-divider" />
            <div className="fc-readonly">
              <div>
                <span>来源</span>
                <b>{(sourceNode?.data as unknown as ScreenData)?.title ?? edge.source}</b>
              </div>
              <div>
                <span>热点</span>
                <b>{hotspot?.label ?? hotspot?.action ?? edge.sourceHandle ?? "—"}</b>
              </div>
              <div>
                <span>去向</span>
                <b>{(targetNode?.data as unknown as Record<string, string>)?.title ?? edge.target}</b>
              </div>
            </div>
          </InspectorSection>

          <InspectorSection title="批注" meta={annotationCount ? `${annotationCount} 条` : "暂无"}>
            <AnnotationPanel targetType="edge" targetId={edge.id} {...annotationProps} />
          </InspectorSection>

          <InspectorSection title="危险操作">
            <p className="fc-inspector-note">删除后，这条跳转及其关联批注将不再可用。</p>
            <button className="fc-btn fc-btn-danger" onClick={() => props.onDeleteEdge(edge.id)}>
              删除这条连线
            </button>
          </InspectorSection>
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="fc-inspector fc-inspector-empty">
        <style>{annotationPanelStyles}</style>
        <div className="fc-panel-title">属性面板</div>
        <div className="fc-inspector-empty-card">
          <strong>还没有选中内容</strong>
          <p>选择画布中的界面、判断、动作、备注或连线，在这里查看和编辑属性。</p>
          <p><b>建立跳转：</b>从界面热点拖到目标界面。</p>
          <p><b>快速预览：</b>按 P 进入原型预览。</p>
        </div>
      </div>
    );
  }

  const pageTitle = `${nodeKindLabel(node.type)}属性`;

  if (node.type === "screen") {
    const data = node.data as unknown as ScreenData;
    const hotspotCount = data.elements.filter((element) => element.hotspot).length;
    const annotationCount = annotationCountFor(props.annotations, "node", node.id);
    return (
      <div className="fc-inspector" data-inspector-kind="screen">
        <style>{annotationPanelStyles}</style>
        <div className="fc-panel-title">{pageTitle}</div>
        <div className="fc-inspector-groups">
          <InspectorSection title="基本信息" meta={data.layout === "free" ? "自由排版" : "竖排"} defaultOpen>
            <div className="fc-inspector-fields">
              <label className="fc-field">
                <span>页面标题</span>
                <input value={data.title} onChange={(e) => props.onPatchScreen(node.id, { title: e.target.value }, `screen:${node.id}:title`)} />
              </label>
              <label className="fc-field">
                <span>副标题 / 备注</span>
                <input
                  value={data.subtitle ?? ""}
                  placeholder="选填，用于补充页面背景"
                  onChange={(e) => props.onPatchScreen(node.id, { subtitle: e.target.value }, `screen:${node.id}:subtitle`)}
                />
              </label>
            </div>
            <div className="fc-inspector-actions" style={{ marginTop: 10 }}>
              <button type="button" className="fc-btn" onClick={() => props.onSaveTemplate(node.id)}>
                存为本地模板
              </button>
            </div>
          </InspectorSection>

          <InspectorSection
            title="界面元素"
            meta={`${data.elements.length} 个${hotspotCount ? ` · ${hotspotCount} 热点` : ""}`}
            defaultOpen
          >
            {data.layout === "free" ? (
              <div className="fc-inspector-actions" style={{ marginBottom: 10 }}>
                <button type="button" className="fc-btn fc-btn-wide" onClick={() => props.onResetLayout(node.id)}>
                  恢复竖排布局
                </button>
              </div>
            ) : (
              <p className="fc-tip">选中界面后，可直接在画布上拖动元素进行自由排版。</p>
            )}
            <div className="fc-el-list">
              {data.elements.map((el) => (
                <div key={el.id} className={`fc-el-row${el.hotspot ? " is-hotspot" : ""}`}>
                  <div className="fc-el-main">
                    <span className="fc-el-kind">
                      {elementKinds.find((k) => k.kind === el.kind)?.label ?? el.kind}
                      {el.hotspot ? " · 可点击" : ""}
                    </span>
                    <input
                      aria-label={`编辑元素文案：${el.label ?? el.kind}`}
                      value={el.label ?? el.placeholder ?? ""}
                      placeholder="元素文案"
                      onChange={(e) => props.onPatchElement(node.id, el.id, { label: e.target.value }, `element:${node.id}:${el.id}:label`)}
                    />
                  </div>
                  <div className="fc-el-actions">
                    <button
                      type="button"
                      className={`fc-chip-btn${el.hotspot ? " is-on" : ""}`}
                      title="设为可点击热点（会生成连线锚点）"
                      aria-pressed={Boolean(el.hotspot)}
                      onClick={() => props.onPatchElement(node.id, el.id, { hotspot: !el.hotspot })}
                    >
                      热点
                    </button>
                    {props.onReorderElement && data.layout === "free" ? (
                      <>
                        <button type="button" className="fc-icon-btn" title="置顶" aria-label={`置顶 ${el.label ?? el.kind}`} onClick={() => props.onReorderElement!(node.id, el.id, "bring-to-front")}>↑</button>
                        <button type="button" className="fc-icon-btn" title="置底" aria-label={`置底 ${el.label ?? el.kind}`} onClick={() => props.onReorderElement!(node.id, el.id, "send-to-back")}>↓</button>
                      </>
                    ) : null}
                    <button type="button" className="fc-icon-btn" title="删除元素" aria-label={`删除元素 ${el.label ?? el.kind}`} onClick={() => props.onRemoveElement(node.id, el.id)}>
                      ×
                    </button>
                  </div>
                  {data.layout === "free" ? (
                    <div className="fc-el-box">
                      <label>
                        X
                        <input
                          type="number"
                          value={Math.round(el.box?.x ?? 0)}
                          onChange={(e) => props.onPatchElement(node.id, el.id, { box: clampMoveBox({ x: Number(e.target.value), y: el.box?.y ?? 0, w: el.box?.w ?? 288, h: el.box?.h }, EL_REGION) }, `element:${node.id}:${el.id}:x`)}
                        />
                      </label>
                      <label>
                        Y
                        <input
                          type="number"
                          value={Math.round(el.box?.y ?? 0)}
                          onChange={(e) => props.onPatchElement(node.id, el.id, { box: clampMoveBox({ x: el.box?.x ?? 16, y: Number(e.target.value), w: el.box?.w ?? 288, h: el.box?.h }, EL_REGION) }, `element:${node.id}:${el.id}:y`)}
                        />
                      </label>
                      <label>
                        宽
                        <input
                          type="number"
                          value={Math.round(el.box?.w ?? 288)}
                          onChange={(e) => props.onPatchElement(node.id, el.id, { box: clampResizeBox({ x: el.box?.x ?? 16, y: el.box?.y ?? 16, w: Number(e.target.value), h: el.box?.h }, EL_REGION) }, `element:${node.id}:${el.id}:w`)}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="fc-add-el">
              {elementKinds.map((k) => (
                <button key={k.kind} type="button" className="fc-chip-btn" onClick={() => props.onAddElement(node.id, k.kind)}>
                  + {k.label}
                </button>
              ))}
            </div>
          </InspectorSection>

          <InspectorSection title="跳转" meta="热点 → 目标">
            <LinkBuilder nodeId={node.id} screen={data} nodes={nodes} onCreateLink={props.onCreateLink} />
          </InspectorSection>

          <InspectorSection title="批注" meta={annotationCount ? `${annotationCount} 条` : "暂无"}>
            <AnnotationPanel targetType="node" targetId={node.id} {...annotationProps} />
          </InspectorSection>

          <InspectorSection title="危险操作">
            <p className="fc-inspector-note">删除界面会同时移除它的跳转关系，此操作需要谨慎。</p>
            <button className="fc-btn fc-btn-danger" onClick={() => props.onDeleteNode(node.id)}>
              删除这个界面
            </button>
          </InspectorSection>
        </div>
      </div>
    );
  }

  if (node.type === "decision") {
    const data = node.data as unknown as DecisionData;
    const annotationCount = annotationCountFor(props.annotations, "node", node.id);
    return (
      <div className="fc-inspector" data-inspector-kind="decision">
        <style>{annotationPanelStyles}</style>
        <div className="fc-panel-title">{pageTitle}</div>
        <div className="fc-inspector-groups">
          <InspectorSection title="基本信息" meta="条件分支" defaultOpen>
            <div className="fc-inspector-fields">
              <label className="fc-field">
                <span>条件</span>
                <input value={data.title} onChange={(e) => props.onPatchNodeData(node.id, { title: e.target.value }, `node:${node.id}:title`)} />
              </label>
              <label className="fc-field">
                <span>是</span>
                <input value={data.yes ?? "是"} onChange={(e) => props.onPatchNodeData(node.id, { yes: e.target.value }, `node:${node.id}:yes`)} />
              </label>
              <label className="fc-field">
                <span>否</span>
                <input value={data.no ?? "否"} onChange={(e) => props.onPatchNodeData(node.id, { no: e.target.value }, `node:${node.id}:no`)} />
              </label>
            </div>
          </InspectorSection>

          <InspectorSection title="跳转" meta="条件连线">
            <p className="fc-inspector-note">从判断节点上的连接点拖出连线，分别连接“是”和“否”的后续流程。</p>
          </InspectorSection>

          <InspectorSection title="批注" meta={annotationCount ? `${annotationCount} 条` : "暂无"}>
            <AnnotationPanel targetType="node" targetId={node.id} {...annotationProps} />
          </InspectorSection>

          <InspectorSection title="危险操作">
            <p className="fc-inspector-note">删除后，判断节点上的连线也会一并移除。</p>
            <button className="fc-btn fc-btn-danger" onClick={() => props.onDeleteNode(node.id)}>
              删除判断
            </button>
          </InspectorSection>
        </div>
      </div>
    );
  }

  if (node.type === "action") {
    const data = node.data as unknown as { title: string; subtitle?: string };
    const annotationCount = annotationCountFor(props.annotations, "node", node.id);
    return (
      <div className="fc-inspector" data-inspector-kind="action">
        <style>{annotationPanelStyles}</style>
        <div className="fc-panel-title">{pageTitle}</div>
        <div className="fc-inspector-groups">
          <InspectorSection title="基本信息" meta="系统动作" defaultOpen>
            <div className="fc-inspector-fields">
              <label className="fc-field">
                <span>标题</span>
                <input value={data.title} onChange={(e) => props.onPatchNodeData(node.id, { title: e.target.value }, `node:${node.id}:title`)} />
              </label>
              <label className="fc-field">
                <span>说明</span>
                <input value={data.subtitle ?? ""} onChange={(e) => props.onPatchNodeData(node.id, { subtitle: e.target.value }, `node:${node.id}:subtitle`)} />
              </label>
            </div>
          </InspectorSection>

          <InspectorSection title="跳转" meta="动作连接">
            <p className="fc-inspector-note">从动作节点拖出连线，连接后续界面或判断。</p>
          </InspectorSection>

          <InspectorSection title="批注" meta={annotationCount ? `${annotationCount} 条` : "暂无"}>
            <AnnotationPanel targetType="node" targetId={node.id} {...annotationProps} />
          </InspectorSection>

          <InspectorSection title="危险操作">
            <p className="fc-inspector-note">删除后，动作节点上的连线也会一并移除。</p>
            <button className="fc-btn fc-btn-danger" onClick={() => props.onDeleteNode(node.id)}>
              删除系统动作
            </button>
          </InspectorSection>
        </div>
      </div>
    );
  }

  const data = node.data as unknown as NoteData;
  const screens = nodes.filter((item) => item.type === "screen");
  const currentAnchor = data.anchor;
  const anchorNodeId = currentAnchor?.nodeId ?? "";
  const anchorSide: NoteAnchorSide = currentAnchor?.side === "bottom" ? "bottom" : "right";
  const linkedScreen = screens.find((item) => item.id === anchorNodeId);
  const annotationCount = annotationCountFor(props.annotations, "node", node.id);
  return (
    <div className="fc-inspector" data-inspector-kind="note">
        <style>{annotationPanelStyles}</style>
      <div className="fc-panel-title">{pageTitle}</div>
      <div className="fc-inspector-groups">
        <InspectorSection title="基本信息" meta="备注内容" defaultOpen>
          <div className="fc-inspector-fields">
            <label className="fc-field">
              <span>标题</span>
              <input value={data.title} onChange={(e) => props.onPatchNodeData(node.id, { title: e.target.value }, `node:${node.id}:title`)} />
            </label>
            <label className="fc-field">
              <span>内容</span>
              <textarea rows={5} value={data.body ?? ""} onChange={(e) => props.onPatchNodeData(node.id, { body: e.target.value }, `node:${node.id}:body`)} />
            </label>
          </div>
        </InspectorSection>

        <InspectorSection title="界面元素" meta="关联界面" defaultOpen>
          <div className="fc-inspector-relation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9.5 14.5 5-5" />
              <path d="M7.2 17.8H6a4 4 0 0 1 0-8h3M16.8 6.2H18a4 4 0 0 1 0 8h-3" />
            </svg>
            <span>{linkedScreen ? `当前说明「${nodeTitle(linkedScreen)}」` : "未关联界面，备注会停留在当前位置。"}</span>
          </div>
          <div className="fc-inspector-fields">
            <label className="fc-field">
              <span>关联界面</span>
              <select
                value={anchorNodeId}
                onChange={(event) => {
                  const nodeId = event.target.value;
                  if (!nodeId) {
                    props.onPatchNodeData(node.id, { anchor: undefined }, `node:${node.id}:anchor`);
                    return;
                  }
                  props.onPatchNodeData(
                    node.id,
                    { anchor: { nodeId, side: anchorSide, gap: currentAnchor?.gap ?? 24 } },
                    `node:${node.id}:anchor`,
                  );
                }}
              >
                <option value="">不关联</option>
                {screens.map((screen) => (
                  <option key={screen.id} value={screen.id}>
                    {nodeTitle(screen)}
                  </option>
                ))}
              </select>
            </label>
            <label className="fc-field">
              <span>放置方向</span>
              <select
                value={anchorSide}
                disabled={!anchorNodeId}
                onChange={(event) => {
                  const side = event.target.value as NoteAnchorSide;
                  props.onPatchNodeData(
                    node.id,
                    { anchor: { nodeId: anchorNodeId, side, gap: currentAnchor?.gap ?? 24 } },
                    `node:${node.id}:anchor`,
                  );
                }}
              >
                {anchorSides.map((side) => (
                  <option key={side.value} value={side.value}>
                    {side.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="fc-inspector-note" style={{ marginTop: 9 }}>关联后，备注会跟随目标界面移动；未选择界面时可自由摆放。</p>
        </InspectorSection>

        <div className="fc-inspector-note-block">
          <strong>跳转</strong>
          <span>备注不参与原型跳转，只用于记录交互说明、约束或待确认事项。</span>
        </div>

        <InspectorSection title="批注" meta={annotationCount ? `${annotationCount} 条` : "暂无"}>
          <AnnotationPanel targetType="node" targetId={node.id} {...annotationProps} />
        </InspectorSection>

        <InspectorSection title="危险操作">
          <p className="fc-inspector-note">删除备注不会影响关联的界面。</p>
          <button className="fc-btn fc-btn-danger" onClick={() => props.onDeleteNode(node.id)}>
            删除备注
          </button>
        </InspectorSection>
      </div>
    </div>
  );
}




