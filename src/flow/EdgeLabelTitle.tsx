/**
 * §8-4 stretch 连线标签原地编辑：双击选中态连线标签 → contentEditable。
 * 交互与 InlineTitle 同语义（Enter/失焦提交、Esc 取消、空文案回退），
 * 提交走 EditorContext.patchEdgeLabel（App 层 patchEdge，historyKey edge:…:label 与 Inspector 同键合并）。
 * 与 InlineTitle 的差异：标签挂在 EdgeLabelRenderer 浮层而非节点内，不需要 nodrag/nopan
 * （浮层本身不参与 RF 拖拽/框选命中），但 onDoubleClick 仍要 stopPropagation 防触发画布手势。
 */
import { memo, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { EditorContext } from "./ScreenView";
import { sanitizeEdgeLabelInput } from "./edgeLabel";

type EdgeLabelTitleProps = {
  edgeId: string;
  value: string;
};

export const EdgeLabelTitle = memo(function EdgeLabelTitle({ edgeId, value }: EdgeLabelTitleProps) {
  const { walkMode, preview, patchEdgeLabel } = useContext(EditorContext);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  const canEdit = !!patchEdgeLabel && !walkMode && !preview;

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    // 全选便于直接输入覆盖
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const commit = () => {
    if (!editing) return;
    setEditing(false);
    const next = sanitizeEdgeLabelInput(ref.current?.textContent ?? "", value);
    if (next) patchEdgeLabel?.(edgeId, next);
  };

  if (editing) {
    return (
      // biome-ignore lint/a11y: 编辑器由双击进入，键盘路径在 onKeyDown 完整处理
      <span
        key="editing"
        ref={ref}
        className="fc-edge-label-text fc-inline-editing"
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
          // 阻断画布快捷键（删除连线等）与 RF 手势
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLElement).blur();
          } else if (e.key === "Escape") {
            // 取消：退出编辑，未提交的文本随组件卸载丢弃
            e.preventDefault();
            setEditing(false);
          }
        }}
      >
        {value}
      </span>
    );
  }

  return (
    <span
      className="fc-edge-label-text fc-edge-label-editable"
      onDoubleClick={(e: ReactMouseEvent<HTMLSpanElement>) => {
        if (!canEdit) return;
        e.stopPropagation();
        setEditing(true);
      }}
      title={canEdit ? "双击编辑触发文案" : undefined}
    >
      {value}
    </span>
  );
});
