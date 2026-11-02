import { useCallback, useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { ScreenView } from "./ScreenView";
import { firstValidationError, namedInputs, normalizeCondition, pickDecisionHandle, resolveFlowTarget } from "./prototypeLogic";
import { debugVarEntries, formatTrail, varSourceMap, type TrailStep } from "./previewDebug";
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
  /** 调试面板开关：变量表 + 走查轨迹 */
  const [debugOpen, setDebugOpen] = useState(false);
  /** 实际走过的界面轨迹：回退不抹掉，重新开始才清空（与面包屑语义不同） */
  const [trail, setTrail] = useState<TrailStep[]>(() =>
    firstScreen ? [{ screenId: firstScreen.id, title: (firstScreen.data as unknown as ScreenData).title || firstScreen.id, via: null }] : [],
  );
  const currentId = stack[stack.length - 1];
  const current = nodes.find((n) => n.id === currentId);
  const display = current && current.type === "screen" ? (current.data as unknown as ScreenData) : null;

  const varRows = useMemo(() => debugVarEntries(vars, varSourceMap(nodes)), [vars, nodes]);

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
    setTrail(
      firstScreen
        ? [{ screenId: firstScreen.id, title: (firstScreen.data as unknown as ScreenData).title || firstScreen.id, via: null }]
        : [],
    );
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
      let via: string = (link.data?.label as string) || "跳转";
      if (decisionNode?.type === "decision") {
        const cond = normalizeCondition((decisionNode.data as unknown as DecisionData).condition);
        const yes = pickDecisionHandle(decisionNode.data as unknown as DecisionData, merged) === "yes";
        const dd = decisionNode.data as unknown as DecisionData;
        if (cond) {
          showToast(`条件「${cond.variable}」${yes ? "成立" : "不成立"} → 走「${yes ? dd.yes ?? "是" : dd.no ?? "否"}」`);
        }
        via = `${via}（${yes ? dd.yes ?? "是" : dd.no ?? "否"}）`;
      }
      setVars(merged);
      setErrorElIds(new Set());
      setAnimDir("fwd");
      setStack((s) => [...s, target]);
      setAnimKey((k) => k + 1);
      const targetNode = nodes.find((n) => n.id === target);
      setTrail((t) =>
        t.concat({
          screenId: target,
          title: (targetNode?.data as unknown as ScreenData | undefined)?.title || target,
          via,
        }),
      );
    },
    [edges, currentId, current, showToast, nodes, inputs, vars],
  );

  const copyTrail = useCallback(() => {
    const text = formatTrail(trail);
    if (!text) return;
    const done = () => showToast("已复制走查路径");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => done());
    } else {
      done();
    }
    // 无剪贴板权限时按钮仍给反馈；路径文本始终显示在面板里可手动复制
  }, [trail, showToast]);

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
          <button
            className={`fc-btn${debugOpen ? " fc-btn-primary" : ""}`}
            onClick={() => setDebugOpen((v) => !v)}
            aria-pressed={debugOpen}
            title="变量表与走查轨迹"
          >
            调试
          </button>
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
        {debugOpen ? (
          <aside className="fc-preview-debug" aria-label="预览调试面板">
            <div className="fc-debug-sec">
              <b>变量表</b>
              <span>{varRows.length || "空"}</span>
            </div>
            {varRows.length ? (
              <div className="fc-debug-vars">
                {varRows.map((row) => (
                  <div key={row.name} className="fc-debug-var">
                    <code>{row.name}</code>
                    <em>{row.value === "" ? '""' : row.value}</em>
                    <span>{row.source}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="fc-debug-hint">填写带变量名的输入框或经过判断节点后，变量值会出现在这里。</p>
            )}
            <div className="fc-debug-sec">
              <b>走查轨迹</b>
              <button type="button" className="fc-chip-btn" onClick={copyTrail}>复制</button>
            </div>
            {trail.length > 1 ? (
              <ol className="fc-debug-trail">
                {trail.map((step, i) => (
                  <li key={`${step.screenId}-${i}`}>
                    {i > 0 ? <em>{step.via ?? "?"}</em> : null}
                    <span className={i === trail.length - 1 ? "is-current" : ""}>{step.title}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="fc-debug-hint">从起点点击控件后，实际走过的界面序列会记录在这里（返回不抹掉，重新开始清空）。</p>
            )}
          </aside>
        ) : null}
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
