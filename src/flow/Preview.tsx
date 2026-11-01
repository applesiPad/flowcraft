import { useCallback, useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ScreenView } from "./ScreenView";
import { firstValidationError, namedInputs, normalizeCondition, pickDecisionHandle, resolveFlowTarget } from "./prototypeLogic";
import type { DecisionData, ScreenData } from "./types";

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
  /** 切换方向：决定设备进场动效（前进右滑入 / 返回左滑入） */
  const [animDir, setAnimDir] = useState<"fwd" | "back">("fwd");
  /** 界面输入值，key = `${screenId}:${elId}`；条件求值时转成变量表 */
  const [inputs, setInputs] = useState<Record<string, string>>({});
  /** 跨界面累积的变量表（条件求值上下文） */
  const [vars, setVars] = useState<Record<string, string>>({});
  /** 当前界面校验失败的元素 id 与提示 */
  const [errorElIds, setErrorElIds] = useState<ReadonlySet<string>>(new Set());

  const currentId = stack[stack.length - 1];
  const current = nodes.find((n) => n.id === currentId);
  const display = current && current.type === "screen" ? (current.data as unknown as ScreenData) : null;

  useEffect(() => {
    if (firstScreen && stack.length === 0) setStack([firstScreen.id]);
  }, [firstScreen, stack.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const editable = Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));
      if (e.key === "Escape") onExit();
      // 输入框里按 Backspace 是删除字符，不能触发「返回上一页」
      if (e.key === "Backspace" && !editable) goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack, onExit]);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setAnimDir("back");
    setAnimKey((k) => k + 1);
    setErrorElIds(new Set());
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1900);
  }, []);

  const resetRun = useCallback(() => {
    setStack(firstScreen ? [firstScreen.id] : []);
    setInputs({});
    setVars({});
    setErrorElIds(new Set());
    setAnimDir("fwd");
    setAnimKey((k) => k + 1);
  }, [firstScreen]);

  const onInputChange = useCallback(
    (elId: string, value: string) => {
      if (!currentId) return;
      setInputs((m) => ({ ...m, [`${currentId}:${elId}`]: value }));
      setErrorElIds((ids) => {
        if (!ids.has(elId)) return ids;
        const next = new Set(ids);
        next.delete(elId);
        return next;
      });
    },
    [currentId],
  );

  const onHotspot = useCallback(
    (elId: string) => {
      const link = edges.find((e) => e.source === currentId && e.sourceHandle === elId);
      if (!link) {
        const data = current?.data as unknown as ScreenData | undefined;
        const el = data?.elements?.find((x) => x.id === elId);
        showToast(`「${el?.label ?? el?.action ?? "该控件"}」还没有配置跳转`);
        return;
      }
      const data = current?.data as unknown as ScreenData | undefined;
      // 收集当前界面的输入值：先校验，后并入变量表
      const values: Record<string, string> = {};
      for (const el of namedInputs(data)) values[el.id] = inputs[`${currentId}:${el.id}`] ?? "";
      const failure = firstValidationError(data, values);
      if (failure) {
        setErrorElIds(new Set([failure.elId]));
        showToast(failure.message);
        return;
      }
      const merged = { ...vars };
      for (const el of namedInputs(data)) {
        if (el.name) merged[el.name] = values[el.id] ?? "";
      }

      // 穿过判断/动作节点，落到下一个界面（判断节点按条件求值选分支）
      const target = resolveFlowTarget(link.target, nodes, edges, merged);
      if (!target) {
        showToast("这条连线最终没有落到界面上");
        return;
      }
      const decisionNode = nodes.find((n) => n.id === link.target);
      if (decisionNode?.type === "decision") {
        const cond = normalizeCondition((decisionNode.data as unknown as DecisionData).condition);
        if (cond) {
          const yes = pickDecisionHandle(decisionNode.data as unknown as DecisionData, merged) === "yes";
          const dd = decisionNode.data as unknown as DecisionData;
          showToast(`条件「${cond.variable}」${yes ? "成立" : "不成立"} → 走「${yes ? dd.yes ?? "是" : dd.no ?? "否"}」`);
        }
      }
      setVars(merged);
      setErrorElIds(new Set());
      setAnimDir("fwd");
      setStack((s) => [...s, target]);
      setAnimKey((k) => k + 1);
    },
    [edges, currentId, current, showToast, nodes, inputs, vars],
  );

  const inputValues = useMemo(() => {
    if (!display || !currentId) return {};
    const out: Record<string, string> = {};
    for (const el of namedInputs(display)) out[`${currentId}:${el.id}`] = inputs[`${currentId}:${el.id}`] ?? "";
    return out;
  }, [display, currentId, inputs]);

  return (
    <div className="fc-preview-overlay">
      <div className="fc-preview-head">
        <div className="fc-preview-title">
          🎬 原型预览
          <span className="fc-preview-sub">
            {stack.length} 步 · 点界面里的控件走流程 · 输入框可填写 · Esc 退出 · Backspace 返回
          </span>
        </div>
        <div className="fc-preview-actions">
          <button className="fc-btn" onClick={goBack} disabled={stack.length <= 1}>
            ← 返回
          </button>
          <button className="fc-btn" onClick={resetRun}>
            ⟲ 重新开始
          </button>
          <button className="fc-btn fc-btn-primary" onClick={onExit}>
            退出预览
          </button>
        </div>
      </div>
      <div className="fc-preview-stage">
        {display ? (
          <div key={animKey} className={`fc-preview-device fc-anim-${animDir}`}>
            <ScreenView
              data={display}
              preview
              onClickHotspot={(el) => onHotspot(el.id)}
              hotspotLabels={Object.fromEntries(
                edges.filter((e) => e.source === currentId).map((e) => [e.sourceHandle ?? "", (e.data?.label as string) ?? ""]),
              )}
              inputValues={inputValues}
              onInputChange={onInputChange}
              errorElIds={errorElIds}
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
