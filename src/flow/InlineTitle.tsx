/**
 * §8-4 节点标题原地编辑：双击 → contentEditable，Enter/失焦提交、Esc 取消、空文案回退。
 * 非受控：编辑态只在进入时播种一次文本，避免 React 重渲染重置光标；
 * 提交走 EditorContext.patchTitle（App 层 patchNodeData，进撤销栈，同卡连续编辑合并为一步）。
 * 与 ScreenView 存在模块级循环（EditorContext 所在），双方都只在渲染期取值，ESM 下安全。
 */
import { memo, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { EditorContext } from "./ScreenView";
import { sanitizeTitleInput } from "./inlineTitle";

type InlineTitleProps = {
  nodeId: string;
  value: string;
  className?: string;
  /** 预览/走查等场景由父级直接关死 */
  editable?: boolean;
};

export const InlineTitle = memo(function InlineTitle({ nodeId, value, className, editable = true }: InlineTitleProps) {
  const { walkMode, preview, patchTitle } = useContext(EditorContext);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  const canEdit = editable && !!patchTitle && !walkMode && !preview;

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
    const next = sanitizeTitleInput(ref.current?.textContent ?? "", value);
    if (next) patchTitle?.(nodeId, next);
  };

  if (editing) {
    return (
      // biome-ignore lint/a11y: 编辑器由双击进入，键盘路径在 onKeyDown 完整处理
      <span
        key="editing"
        ref={ref}
        className={`${className ?? ""} fc-inline-editing nodrag nopan nowheel`}
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
          // 阻断画布快捷键（删除节点等）与 RF 拖拽
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
      className={className}
      onDoubleClick={(e: ReactMouseEvent<HTMLSpanElement>) => {
        if (!canEdit) return;
        e.stopPropagation();
        setEditing(true);
      }}
      title={canEdit ? "双击编辑标题" : undefined}
    >
      {value}
    </span>
  );
});
