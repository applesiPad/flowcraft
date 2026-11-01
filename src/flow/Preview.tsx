import { useCallback, useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ScreenView } from "./ScreenView";
import type { ScreenData } from "./types";

type Props = {
  nodes: Node[];
  edges: Edge[];
  startId: string | null;
  onExit: () => void;
};

/** 原型播放器：点界面里的真实控件沿连线跳转，接近原生 App 的操作手感。 */
export function Preview({ nodes, edges, startId, onExit }: Props) {
  const firstScreen = useMemo(
    () => nodes.find((n) => n.id === startId) ?? nodes.find((n) => n.type === "screen"),
    [nodes, startId],
  );
  const [stack, setStack] = useState<string[]>(firstScreen ? [firstScreen.id] : []);
  const [toast, setToast] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const currentId = stack[stack.length - 1];
  const current = nodes.find((n) => n.id === currentId);

  useEffect(() => {
    if (firstScreen && stack.length === 0) setStack([firstScreen.id]);
  }, [firstScreen, stack.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (e.key === "Backspace") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack, onExit]);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setAnimKey((k) => k + 1);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }, []);

  const onHotspot = useCallback(
    (elId: string) => {
      const link = edges.find((e) => e.source === currentId && e.sourceHandle === elId);
      if (!link) {
        const data = current?.data as unknown as ScreenData | undefined;
        const el = data?.elements?.find((x) => x.id === elId);
        showToast(`「${el?.label ?? el?.action ?? "该控件"}」还没有配置跳转`);
        return;
      }
      // 穿过判断/动作节点，直接落到下一个界面（默认走「是」分支）
      let target = link.target;
      let guard = 0;
      while (guard++ < 24) {
        const node = nodes.find((n) => n.id === target);
        if (!node || node.type === "screen") break;
        const outs = edges.filter((e) => e.source === target);
        if (!outs.length) break;
        const next = node.type === "decision" ? outs.find((e) => e.sourceHandle === "yes") ?? outs[0] : outs[0];
        target = next.target;
      }
      setStack((s) => [...s, target]);
      setAnimKey((k) => k + 1);
    },
    [edges, currentId, current, showToast, nodes],
  );

  const display = current && current.type === "screen" ? (current.data as unknown as ScreenData) : null;

  return (
    <div className="fc-preview-overlay">
      <div className="fc-preview-head">
        <div className="fc-preview-title">
          🎬 原型预览
          <span className="fc-preview-sub">
            {stack.length} 步 · 点界面里的控件走流程 · Esc 退出 · Backspace 返回
          </span>
        </div>
        <div className="fc-preview-actions">
          <button className="fc-btn" onClick={goBack} disabled={stack.length <= 1}>
            ← 返回
          </button>
          <button className="fc-btn" onClick={() => setStack(firstScreen ? [firstScreen.id] : [])}>
            ⟲ 重新开始
          </button>
          <button className="fc-btn fc-btn-primary" onClick={onExit}>
            退出预览
          </button>
        </div>
      </div>
      <div className="fc-preview-stage">
        {display ? (
          <div key={animKey} className="fc-preview-device">
            <ScreenView
              data={display}
              preview
              onClickHotspot={(el) => onHotspot(el.id)}
              hotspotLabels={Object.fromEntries(
                edges.filter((e) => e.source === currentId).map((e) => [e.sourceHandle ?? "", (e.data?.label as string) ?? ""]),
              )}
            />
          </div>
        ) : (
          <div className="fc-preview-empty">当前节点不是界面节点，无法预览。请从界面节点开始。</div>
        )}
        {toast ? <div className="fc-toast">{toast}</div> : null}
      </div>
      <div className="fc-preview-path">
        {stack.map((id, i) => {
          const n = nodes.find((x) => x.id === id);
          const t = (n?.data as unknown as ScreenData | undefined)?.title ?? id;
          return (
            <span key={`${id}-${i}`} className="fc-path-item">
              <button className={i === stack.length - 1 ? "is-current" : ""} onClick={() => setStack((s) => s.slice(0, i + 1))}>
                {t}
              </button>
              {i < stack.length - 1 ? <span className="fc-path-sep">→</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
