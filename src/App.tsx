import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  PanOnScrollMode,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ActionNode, DecisionNode, NoteNode, ScreenNode } from "./flow/nodes";
import { FlowEdge, BezierConnectionLine } from "./flow/edges";
import { Palette, type PaletteDragPayload } from "./flow/Palette";
import { Inspector } from "./flow/Inspector";
import { Preview } from "./flow/Preview";
import { Icon } from "./flow/Icon";
import { moveElementZ, type ZOrderAction } from "./flow/elementEditor";
import { applyAlignAction, type AlignAction, type AlignBox } from "./flow/alignDistribute";
import type { EdgeRouteMode } from "./flow/edgeRouting";
import { EditorContext } from "./flow/ScreenView";
import { initialEdges, initialNodes, screenTemplates } from "./flow/sample";
import { buildPackGraph, packBounds, screenPacks, PACK_NODE_SIZE, type ScreenPack } from "./flow/templatePacks";
import { buildPrototypeHtml } from "./flow/exportHtml";
import { resolveFlowTarget } from "./flow/prototypeLogic";
import {
  ensureCanvases,
  newCanvasMeta,
  readCanvasData,
  removeCanvasData,
  sanitizeCanvasName,
  uniqueCanvasName,
  writeActiveCanvasId,
  writeCanvasData,
  writeCanvasList,
  type CanvasMeta,
} from "./flow/canvasStore";
import {
  addSnapshot,
  autoSnapshotName,
  diffFlows,
  groupSnapshotsByDay,
  readSnapshots,
  removeSnapshot,
  renameSnapshot,
  type FlowDiff,
  type FlowSnapshot,
} from "./flow/snapshotStore";
import { computeDeadHints, HEALTH_KIND_LABEL, scanFlowHealth, type HealthIssue } from "./flow/flowHealth";
import { AI_EXAMPLES, buildAiPack, findBlankAnchor, planFlowFromText, screenViewsForSuggestion, suggestWires, type AiPlanResult, type WireSuggestion } from "./flow/aiFlow";
import { parseFlowFile, summarizeImport, type ImportResult } from "./flow/schemaMigrate";
import { buildReportHtml } from "./flow/exportReport";
import { installQaProbe } from "./flow/qaProbe";
import { exportTextFile } from "./flow/exportFile";
import {
  applyFlowHistory,
  diffFlowHistory,
  refreshFlowHistoryEntry,
  trimFlowHistory,
  type FlowHistoryEntry,
} from "./flow/history";
import { HOTSPOT_IN, type DecisionData } from "./flow/types";
import { benchDomCounts, buildBenchFlow, measureFps, parseBenchLevel, type BenchLevel } from "./flow/benchGraph";
import type { ElementBox, ScreenData, ScreenElement, ScreenTemplate } from "./flow/types";
import {
  deleteAnnotation,
  parseAnnotations,
  updateAnnotation,
  type Annotation,
} from "./flow/annotations";
import {
  buildTemplateBundle,
  cloneTemplateForInsert,
  mergeTemplates,
  parseTemplateBundle,
} from "./flow/templateMarket";
import type { CanvasExportResult, ExportFormat } from "./flow/exportTypes";
import { cascadeDeleteNode, layoutAnchoredNotes, migrateLegacyNoteAnchors } from "./flow/noteLayout";
import { applyTheme, edgeMarkerColor, nextTheme, readTheme, THEME_STORAGE_KEY, type Theme } from "./flow/theme";
const nodeTypes = { screen: ScreenNode, decision: DecisionNode, action: ActionNode, note: NoteNode };
const edgeTypes = { flow: FlowEdge };
const STORAGE_KEY = "flowcraft.flow.v1";
const TEMPLATE_STORAGE_KEY = "flowcraft.templates.v1";
const ANNOTATION_STORAGE_KEY = "flowcraft.annotations.v1";
/** 可视区裁剪开关持久化（2026-11-01 基线测量后默认开启，见 docs/perf-baseline-2026-11-01.md） */
const CULL_STORAGE_KEY = "flowcraft.cull.v1";
/** 可拖拽面板的视口位置（fixed 坐标，左上角），用户拖过后不再跟随默认位 */
const AI_PANEL_POS_KEY = "flowcraft.aiPanelPos.v1";
const PALETTE_POS_KEY = "flowcraft.palettePos.v1";
const INSPECTOR_POS_KEY = "flowcraft.inspectorPos.v1";
const EMPTY_HOTSPOT_KEYS = new Set<string>();

/** 面板拖放位置钳制回视口内（8px 内边距），rect 为面板当前尺寸。 */
function clampPanelPos(pos: { x: number; y: number }, rect: { width: number; height: number }) {
  return {
    x: Math.min(Math.max(pos.x, 8), Math.max(window.innerWidth - rect.width, 8)),
    y: Math.min(Math.max(pos.y, 8), Math.max(window.innerHeight - rect.height, 8)),
  };
}

/**
 * 可拖拽面板通用机制：头部 onPointerDown 起拖，窗口 move 跟随 + 视口钳制，
 * 松手/resize 持久化与钳制，双击把手调 reset 复位。pos=null 表示未拖过（跟随默认位）。
 */
function usePanelDrag(storageKey: string, active: boolean) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? "null") as { x: number; y: number } | null;
      return raw && typeof raw.x === "number" && typeof raw.y === "number" ? raw : null;
    } catch {
      return null;
    }
  });
  const ref = useRef<HTMLElement | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  const onDragStart = useCallback((event: React.PointerEvent) => {
    // 只响应主键；面板内文本输入/按钮的点击不触发拖动
    if (event.button !== 0) return;
    const panel = ref.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.preventDefault();
  }, []);

  useEffect(() => {
    if (!active) return;
    const onMove = (event: PointerEvent) => {
      const offset = dragOffset.current;
      const panel = ref.current;
      if (!offset || !panel) return;
      const rect = panel.getBoundingClientRect();
      setPos(clampPanelPos({ x: event.clientX - offset.dx, y: event.clientY - offset.dy }, rect));
    };
    const onUp = () => {
      if (!dragOffset.current) return;
      dragOffset.current = null;
      setPos((current) => {
        if (!current) return current;
        const rect = ref.current?.getBoundingClientRect();
        const clamped = rect ? clampPanelPos(current, rect) : current;
        try {
          localStorage.setItem(storageKey, JSON.stringify(clamped));
        } catch {
          /* 存储满/禁用时静默，只影响下次打开位置 */
        }
        return clamped;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [active, storageKey]);

  /** 窗口缩放时把面板拉回可视区，避免面板留在屏幕外。 */
  useEffect(() => {
    if (!active || !pos) return;
    const onResize = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setPos((current) => (current ? clampPanelPos(current, rect) : current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, pos]);

  const reset = useCallback(() => {
    setPos(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return { ref, pos, onDragStart, reset };
}

type SearchItem = {
  key: string;
  kind: "node" | "edge";
  id: string;
  nodeId: string;
  title: string;
  detail: string;
};

function readCustomTemplates(): ScreenTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? "[]") as unknown;
    return mergeTemplates([], Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function readAnnotations(): Annotation[] {
  try {
    return parseAnnotations(localStorage.getItem(ANNOTATION_STORAGE_KEY));
  } catch {
    return [];
  }
}

const markerFor = (theme: Theme) => ({ type: MarkerType.ArrowClosed, color: edgeMarkerColor(theme), width: 16, height: 16 } as const);

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`;
}
function CanvasApp({ exampleMode = false, benchMode = null }: { exampleMode?: boolean; benchMode?: BenchLevel | null }) {
  const bench = useMemo(() => (benchMode ? buildBenchFlow(benchMode) : null), [benchMode]);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [nodes, setNodes, onNodesChange] = useNodesState(exampleMode || bench ? [] : initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(exampleMode || bench ? [] : initialEdges);
  const [cull, setCull] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // 压测入口用 URL 参数强制指定；正常入口读用户偏好，默认开
      if (params.get("bench")) return params.get("cull") === "1";
      const stored = localStorage.getItem(CULL_STORAGE_KEY);
      return stored !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (window.__fcBench) window.__fcBench.cull = cull;
    if (benchMode) return; // 压测模式不落偏好
    try {
      localStorage.setItem(CULL_STORAGE_KEY, cull ? "1" : "0");
    } catch {
      /* 隐私模式下忽略 */
    }
  }, [cull, benchMode]);
  // 导出/打印克隆的是实时 DOM：裁剪开启时必须先临时全量渲染，否则视口外内容会缺失
  const [renderAllForExport, setRenderAllForExport] = useState(false);
  const [showHotspots, setShowHotspots] = useState(true);
  const [preview, setPreview] = useState(false);
  const [previewStart, setPreviewStart] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  /** §8-5 多选集合（onSelectionChange 全量同步），≥2 时浮现对齐/分布工具条 */
  const [selNodeIds, setSelNodeIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<string>("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [walkMode, setWalkMode] = useState(false);
  const [flashNode, setFlashNode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<ScreenTemplate[]>(readCustomTemplates);
  const [annotations, setAnnotations] = useState<Annotation[]>(readAnnotations);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [canvasMenuPosition, setCanvasMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [renamingCanvasId, setRenamingCanvasId] = useState<string | null>(null);
  const [confirmDeleteCanvasId, setConfirmDeleteCanvasId] = useState<string | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiPlan, setAiPlan] = useState<AiPlanResult | null>(null);
  /** 「续写」锚定的卡片 id：插入时把生成流程放到这张卡旁边，而不是全局空白区 */
  const [aiAnchorNodeId, setAiAnchorNodeId] = useState<string | null>(null);
  const aiPanel = usePanelDrag(AI_PANEL_POS_KEY, aiOpen);
  /** 画布常驻 AI 输入条（底部居中）：折叠胶囊 ⇄ 单行输入，Ctrl/⌘+K 唤起 */
  const [aiBarOpen, setAiBarOpen] = useState(false);
  const aiBarInputRef = useRef<HTMLInputElement | null>(null);
  /** 桌面常驻抽屉的拖拽（移动端抽屉是另一套 fixed 结构，不受影响） */
  const palettePanel = usePanelDrag(PALETTE_POS_KEY, true);
  const inspectorPanel = usePanelDrag(INSPECTOR_POS_KEY, true);
  const [snapshots, setSnapshots] = useState<FlowSnapshot[]>([]);
  const [renamingSnapId, setRenamingSnapId] = useState<string | null>(null);
  const [diffView, setDiffView] = useState<{ name: string; diff: FlowDiff } | null>(null);
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canvasMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimer = useRef<number | null>(null);

  const { screenToFlowPosition, getViewport, getNodes, fitView, setViewport, setCenter } = useReactFlow();
  const zoom = useStore((st) => st.transform[2]);
  const canonicalNodes = useMemo(() => layoutAnchoredNotes(nodes), [nodes]);
  const markerEnd = useMemo(() => markerFor(theme), [theme]);
  const displayEdges = useMemo(() => edges.map((edge) => ({ ...edge, markerEnd })), [edges, markerEnd]);
  const past = useRef<FlowHistoryEntry[]>([]);
  const future = useRef<FlowHistoryEntry[]>([]);
  const pendingHistory = useRef<{ nodes: Node[]; edges: Edge[]; key?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);


  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* 隐私模式下主题仍可在当前会话生效 */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(customTemplates));
    } catch {
      showToast("模板保存失败：浏览器本地存储不可用或已满");
    }
  }, [customTemplates, showToast]);

  useEffect(() => {
    try {
      localStorage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(annotations));
    } catch {
      showToast("批注保存失败：浏览器本地存储不可用或已满");
    }
  }, [annotations, showToast]);

  /* ---------- 本地持久化 ---------- */
  useEffect(() => {
    if (bench && benchMode) {
      // 压测图是一次性合成数据：直接注入，不读写 localStorage，避免污染真实存档。
      const mountedAt = performance.now();
      setNodes(bench.nodes.map((node) => ({ ...node })));
      setEdges(bench.edges.map((edge) => ({ ...edge })));
      window.__fcBench = {
        level: benchMode,
        cull,
        nodeCount: bench.nodes.length,
        edgeCount: bench.edges.length,
        mountedAt,
        fitDoneAt: 0,
        mountEpoch: Date.now(),
        fps: null,
        fpsAt: 0,
        fpsLabel: "",
        measureFps,
        startFps: (seconds: number, label: string) => {
          void measureFps(seconds).then((sample) => {
            if (window.__fcBench) {
              window.__fcBench.fps = sample;
              window.__fcBench.fpsLabel = label;
              window.__fcBench.fpsAt = Date.now();
            }
          });
        },
        domCounts: benchDomCounts,
        markFit: () => {
          if (window.__fcBench) {
            window.__fcBench.fitDoneAt = performance.now();
            window.__fcBench.mountEpoch = Date.now();
          }
          return window.__fcBench?.fitDoneAt ?? 0;
        },
      };
      window.setTimeout(() => fitView({ padding: 0.1, minZoom: 0.08, maxZoom: 0.9 }), 420);
      window.setTimeout(() => window.__fcBench?.markFit?.(), 700);
      return;
    }
    if (exampleMode) {
      setNodes(initialNodes.map((node) => ({ ...node })));
      setEdges(initialEdges.map((edge) => ({ ...edge })));
      window.setTimeout(() => fitView({ padding: 0.12, minZoom: 0.18, maxZoom: 0.7 }), 420);
      return;
    }
    let hasSaved = false;
    let legacyFlow: { nodes: Node[]; edges: Edge[]; annotations: Annotation[] } | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { nodes: Node[]; edges: Edge[]; annotations?: unknown };
        if (Array.isArray(parsed.nodes) && parsed.nodes.length) {
          setNodes(migrateLegacyNoteAnchors(parsed.nodes));
          setEdges(parsed.edges ?? []);
          if (Array.isArray(parsed.annotations)) setAnnotations(parseAnnotations(parsed.annotations));
          setRestored(true);
          hasSaved = true;
          legacyFlow = { nodes: parsed.nodes, edges: parsed.edges ?? [], annotations: Array.isArray(parsed.annotations) ? parseAnnotations(parsed.annotations) : [] };
          window.setTimeout(() => setRestored(false), 2200);
        }
      }
    } catch {
      /* 本地存储不可用或缓存损坏时，先用内置样例启动。 */
    }
    // 多画布登记：legacy 存档原地登记为第一个画布（flow.v1 仍是活动画布的存储）
    try {
      const ensured = ensureCanvases(localStorage, legacyFlow, () => uid("c"));
      setCanvases(ensured.list);
      setActiveCanvasId(ensured.activeId);
    } catch {
      /* 隐私模式下忽略 */
    }
    // 首次进入：有存档就整体适配，没有就聚焦到第一张界面上（避免一上来缩成小点）
    if (hasSaved) {
      // 有存档：按「可读优先」取景，最小 0.5 —— 大图不会一上来缩成看不清的小点
      window.setTimeout(() => fitView({ padding: 0.16, minZoom: 0.5, maxZoom: 0.9 }), 220);
    } else {
      window.setTimeout(() => setViewport({ x: 48, y: -110, zoom: 0.78 }), 220);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (exampleMode || bench) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: canonicalNodes, edges, annotations }));
        setSaveFailed(false);
        setSaved(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      } catch {
        setSaved("");
        setSaveFailed(true);
        showToast("本地保存失败：浏览器存储不可用或已满，请导出 JSON 备份");
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [canonicalNodes, edges, annotations, showToast]);

  // 强制重测一次节点尺寸/锚点：否则部分环境下（dev 模式、首帧布局变化）连线会因为拿不到 handleBounds 而不渲染
  const nodeIdKey = useMemo(() => nodes.map((n) => n.id).join("|"), [nodes]);
  useEffect(() => {
    const ids = nodeIdKey ? nodeIdKey.split("|") : [];
    if (!ids.length) return;
    const t = window.setTimeout(() => updateNodeInternals(ids), 160);
    const t2 = window.setTimeout(() => updateNodeInternals(ids), 700);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [nodeIdKey, updateNodeInternals]);

  const recordHistory = useCallback((entry: FlowHistoryEntry) => {
    past.current = trimFlowHistory(past.current.concat(entry));
    future.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  // 操作前只保存基线引用；状态提交后 diff 出少量变更记录，不再保存整份画布快照。
  const snapshot = useCallback((coalesceKey?: string) => {
    const pending = pendingHistory.current;
    if (pending?.key && pending.key === coalesceKey) return;
    pendingHistory.current = { nodes, edges, key: coalesceKey };
  }, [nodes, edges]);

  /* 包装 onNodesChange：在 React Flow 内置删除（Delete/Backspace）前拍快照，
     否则 pendingHistory 没有基线，diff 为空不会记录历史 => 撤销失效 */
  const wrappedOnNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const hasRemoval = changes.some(
        (c: { type?: string }) => c.type === "remove",
      );
      if (hasRemoval) snapshot();
      onNodesChange(changes);
    },
    [onNodesChange, snapshot],
  );

  const wrappedOnEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      const hasRemoval = changes.some(
        (c: { type?: string }) => c.type === "remove",
      );
      if (hasRemoval) snapshot();
      onEdgesChange(changes);
    },
    [onEdgesChange, snapshot],
  );

  useEffect(() => {
    const baseline = pendingHistory.current;
    if (!baseline || (baseline.nodes === nodes && baseline.edges === edges)) return;

    const entry = diffFlowHistory(baseline.nodes, baseline.edges, nodes, edges, baseline.key);
    if (!entry) {
      if (!baseline.key) pendingHistory.current = null;
      return;
    }
    const latest = past.current[past.current.length - 1];
    const isContinuingInput = !!baseline.key && latest?.key === baseline.key;
    if (!isContinuingInput) recordHistory(entry);
    if (!baseline.key) pendingHistory.current = null;
  }, [edges, nodes, recordHistory]);

  const moveHistory = useCallback(
    (from: typeof past, to: typeof future, direction: "undo" | "redo") => {
      const entry = from.current.pop();
      if (!entry) return;

      // 连续输入 / 连续拖拽后的最终状态，在这一刻才写回反向侧。
      const refreshed = refreshFlowHistoryEntry(
        entry,
        direction === "undo" ? "redoValue" : "undoValue",
        nodes,
        edges,
      );
      to.current = trimFlowHistory(to.current.concat(refreshed));
      pendingHistory.current = null;

      const next = applyFlowHistory(refreshed, direction, nodes, edges);
      setNodes(next.nodes);
      setEdges(next.edges);
      setHistoryVersion((v) => v + 1);
    },
    [edges, nodes, setEdges, setNodes],
  );

  const undo = useCallback(() => moveHistory(past, future, "undo"), [moveHistory]);
  const redo = useCallback(() => moveHistory(future, past, "redo"), [moveHistory]);

  /* ---------- 新建节点 ---------- */
  const allScreenTemplates = useMemo(() => {
    const map: Record<string, ScreenTemplate> = { ...screenTemplates };
    customTemplates.forEach((tpl, index) => {
      const id = tpl.id ?? `custom-${index}`;
      map[id] = { ...tpl, id };
    });
    return map;
  }, [customTemplates]);

  const createNode = useCallback((payload: Exclude<PaletteDragPayload, { kind: "pack" }>, position: { x: number; y: number }): Node => {
    if (payload.kind === "screen") {
      const tpl = allScreenTemplates[payload.template];
      if (!tpl) throw new Error("模板不存在，可能已被删除");
      const data = cloneTemplateForInsert(tpl);
      return { id: uid("n"), type: "screen", position, data: data as unknown as Record<string, unknown>, style: { width: 320 } };
    }
    if (payload.kind === "decision") {
      return { id: uid("d"), type: "decision", position, data: { title: "条件判断？", yes: "是", no: "否" } };
    }
    if (payload.kind === "action") {
      return { id: uid("a"), type: "action", position, data: { title: "系统动作", subtitle: "接口 / 回调 / 提示" } };
    }
    return { id: uid("note"), type: "note", position, data: { title: "备注", body: "写点交互说明…", tone: "note" } };
  }, [allScreenTemplates]);

  const saveScreenTemplate = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node?.type !== "screen") return;
      const data = node.data as unknown as ScreenData;
      const template: ScreenTemplate = {
        id: uid("tpl"),
        name: data.title || "未命名界面",
        icon: "★",
        data: JSON.parse(JSON.stringify(data)) as ScreenData,
      };
      setCustomTemplates((ts) => ts.concat(template));
      showToast(`已保存模板：${template.name}`);
    },
    [nodes, showToast],
  );

  const deleteScreenTemplate = useCallback((id: string) => {
    setCustomTemplates((ts) => ts.filter((tpl) => (tpl.id ?? "") !== id));
  }, []);

  /** 插入整套行业模板包：一次 snapshot + 一次批量提交 => 一条可撤销记录。 */
  const insertPack = useCallback(
    (pack: ScreenPack, anchor: { x: number; y: number }) => {
      const bounds = packBounds(pack);
      const graph = buildPackGraph(pack, { x: anchor.x - bounds.minX, y: anchor.y - bounds.minY }, uid);
      if (!graph.nodes.length) return;
      snapshot();
      // 主界面节点直接进入 React Flow 选择态：否则 onSelectionChange 的空选择事件会把
      // selNode 冲掉，插入后属性面板与预览起点都会退回第一个界面
      const primaryIndex = graph.nodes.findIndex((n) => n.type === "screen");
      setNodes((ns) => ns.concat(graph.nodes.map((n, i) => (i === primaryIndex ? { ...n, selected: true } : n))));
      setEdges((es) => es.concat(graph.edges));
      setSelNode(graph.nodes[primaryIndex].id);
      setSelEdge(null);
      setInspectorOpen(true);
      // 包比单个节点宽得多：让新节点进入视野而不是留在原地看不见
      window.setTimeout(() => fitView({ padding: 0.18, minZoom: 0.1, maxZoom: 0.9, duration: 420, nodes: graph.nodes }), 40);
      showToast(`已插入模板包「${pack.name}」：${graph.nodes.length} 个节点 / ${graph.edges.length} 条连线`);
    },
    [fitView, setEdges, setNodes, showToast, snapshot],
  );

  const addAtCenter = useCallback(
    (payload: PaletteDragPayload) => {
      if (payload.kind === "pack") {
        const pack = screenPacks.find((p) => p.id === payload.pack);
        if (!pack) {
          showToast("模板包不存在，可能已下线");
          return;
        }
        const viewport = getViewport();
        insertPack(pack, {
          x: (-viewport.x + window.innerWidth * 0.42) / viewport.zoom,
          y: (-viewport.y + window.innerHeight * 0.36) / viewport.zoom,
        });
        return;
      }
      snapshot();
      const viewport = getViewport();
      const position = {
        x: (-viewport.x + window.innerWidth * 0.42) / viewport.zoom,
        y: (-viewport.y + window.innerHeight * 0.36) / viewport.zoom,
      };
      const node = createNode(payload, position);
      setNodes((ns) => ns.concat({ ...node, selected: true }));
      setSelNode(node.id);
      setSelEdge(null);
      setInspectorOpen(true);
    },
    [createNode, getViewport, insertPack, setNodes, showToast, snapshot],
  );

  /* ---------- AI 助手 ---------- */
  /** 全画布死路补线建议（面板与选中上下文共用同一份）。 */
  const wireSuggestions = useMemo(
    () => suggestWires(screenViewsForSuggestion(nodes), edges),
    [nodes, edges],
  );

  /** 按节点 id 取界面标题（上下文条展示用），找不到时回退到 id。 */
  const wireTargetTitle = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      const data = n?.data as unknown as ScreenData | undefined;
      return (typeof data?.title === "string" && data.title) || id;
    },
    [nodes],
  );

  /** 「以此为起点续写」：选中卡标题作为种子填入输入框并聚焦，插入时锚定到这张卡旁边。 */
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const seedAiContinue = useCallback(
    (title: string, nodeId: string) => {
      setAiText(`${title} → `);
      setAiAnchorNodeId(nodeId);
      setAiPlan(null);
      setAiOpen(true);
      showToast(`已把「${title}」作为流程起点：接着输入后面的步骤，Ctrl+Enter 生成`);
      // 等受控值渲染进 textarea 再聚焦，光标落在「→ 」之后
      requestAnimationFrame(() => {
        const el = aiTextareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    },
    [showToast],
  );

  const runAiPlan = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setAiPlan(null);
        return;
      }
      const plan = planFlowFromText(trimmed);
      if (!plan.steps.length) {
        setAiPlan(null);
        showToast("没识别出步骤：用「→」或顿号把流程串起来，例如「首页 → 详情 → 支付」");
        return;
      }
      setAiPlan(buildAiPack(plan, `AI：${plan.scenario}`));
    },
    [showToast],
  );

  /** 常驻输入条的 Enter：生成预览并清掉续写锚定残留（面板续写流可能设置过）。 */
  const runAiBar = useCallback(
    (text: string) => {
      runAiPlan(text);
      setAiAnchorNodeId(null);
    },
    [runAiPlan],
  );

  const insertAiPack = useCallback(
    (result: AiPlanResult, anchorNodeId?: string | null) => {
      if (result.problems.length) {
        showToast(`生成的流程有问题：${result.problems[0]}`);
        return;
      }
      const bounds = packBounds(result.pack);
      const obstacles = nodes
        .filter((n) => n.type !== "note")
        .map((n) => ({
          x: n.position.x,
          y: n.position.y,
          width: typeof n.style?.width === "number" ? n.style.width : n.measured?.width ?? PACK_NODE_SIZE.screen.w,
          height: n.measured?.height ?? PACK_NODE_SIZE.screen.h,
        }));
      // 续写锚定：起点卡周围按 右→下→右下→左 找不撞卡的空位（160px 净空），
      // 全部被占时才回退 findBlankAnchor 全局空白区。
      const anchorNode = (anchorNodeId ?? aiAnchorNodeId) ? nodes.find((n) => n.id === (anchorNodeId ?? aiAnchorNodeId)) : null;
      let anchor: { x: number; y: number } | null = null;
      if (anchorNode) {
        const aw = typeof anchorNode.style?.width === "number" ? anchorNode.style.width : anchorNode.measured?.width ?? PACK_NODE_SIZE.screen.w;
        const ah = anchorNode.measured?.height ?? PACK_NODE_SIZE.screen.h;
        const packW = bounds.maxX - bounds.minX;
        const packH = bounds.maxY - bounds.minY;
        const GAP = 160;
        const candidates = [
          { x: anchorNode.position.x + aw + GAP, y: anchorNode.position.y },
          { x: anchorNode.position.x, y: anchorNode.position.y + ah + GAP },
          { x: anchorNode.position.x + aw + GAP, y: anchorNode.position.y + ah + GAP },
          { x: anchorNode.position.x - packW - GAP, y: anchorNode.position.y },
        ];
        anchor =
          candidates.find(
            (c) =>
              !obstacles.some(
                (o) => c.x < o.x + o.width && c.x + packW > o.x && c.y < o.y + o.height && c.y + packH > o.y,
              ),
          ) ?? null;
      }
      if (!anchor) {
        // 锚点不能落在现有卡片上：物理重叠会让「线不穿卡」不变式几何无解。
        // 按现有节点包围盒自动找空白带（右侧优先，放不下放下方）。
        anchor = findBlankAnchor(obstacles, {
          width: bounds.maxX - bounds.minX,
          height: bounds.maxY - bounds.minY,
        });
      }
      insertPack(result.pack, { x: anchor.x - bounds.minX, y: anchor.y - bounds.minY });
      // 只有这次插入真的用到了续写锚定时才清；显式传参的一次性锚点不动共享状态
      if (!anchorNodeId) setAiAnchorNodeId(null);
    },
    [nodes, aiAnchorNodeId, insertPack, showToast],
  );

  /** 常驻输入条：Enter 生成预览；插入时若正选中界面/判断卡则锚定到它旁边。 */
  const insertFromAiBar = useCallback(() => {
    if (!aiPlan) return;
    const selected = selNode ? nodes.find((n) => n.id === selNode) : null;
    const anchor = selected && (selected.type === "screen" || selected.type === "decision") ? selected.id : null;
    insertAiPack(aiPlan, anchor);
    setAiBarOpen(false);
    aiBarInputRef.current?.blur();
  }, [aiPlan, selNode, nodes, insertAiPack]);

  const expandAiPanelFromBar = useCallback(() => {
    setAiOpen(true);
    setHealthOpen(false);
    setSnapOpen(false);
    setAiBarOpen(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const raw = event.dataTransfer.getData("application/flowcraft");
      if (!raw) return;
      event.preventDefault();
      const payload = JSON.parse(raw) as PaletteDragPayload;
      if (payload.kind === "pack") {
        const pack = screenPacks.find((p) => p.id === payload.pack);
        if (!pack) {
          showToast("模板包不存在，可能已下线");
          return;
        }
        insertPack(pack, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        return;
      }
      snapshot();
      const node = createNode(payload, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      setNodes((ns) => ns.concat({ ...node, selected: true }));
      setSelNode(node.id);
      setSelEdge(null);
      setInspectorOpen(true);
    },
    [createNode, insertPack, screenToFlowPosition, setNodes, showToast, snapshot],
  );

  /* ---------- 连线 ---------- */
  const commitConnection = useCallback(
    (connection: Connection) => {
      snapshot();
      const source = nodes.find((n) => n.id === connection.source);
      const srcData = source?.data as unknown as ScreenData | undefined;
      const el = srcData?.elements?.find((e) => e.id === connection.sourceHandle);
      const label = el ? `点击「${el.label ?? el.action ?? "热点"}」` : "跳转";
      setEdges((es) =>
        addEdge(
          {
            ...connection,
            id: uid("e"),
            type: "flow",
            markerEnd,
            data: { label },
          },
          es,
        ),
      );
    },
    [markerEnd, nodes, setEdges, snapshot],
  );

  /** 采纳一条 AI 补线建议：走快照 + addEdge，与手动连线同一管线（可撤销）。 */
  const acceptWireSuggestion = useCallback(
    (suggestion: WireSuggestion) => {
      const source = nodes.find((n) => n.id === suggestion.source);
      if (!source) return;
      const srcData = source.data as unknown as ScreenData;
      // 建议里的 handle 是轻量探测值；这里从节点真实元素里解析主按钮热点
      const hotspots = (srcData.elements ?? []).filter((el) => el.hotspot);
      const primary = hotspots.find((el) => el.tone === "primary") ?? hotspots[0];
      if (!primary) {
        showToast(`「${srcData.title ?? source.id}」没有可用的热点控件，先加一个按钮再接线`);
        return;
      }
      commitConnection({
        source: suggestion.source,
        sourceHandle: primary.id,
        target: suggestion.target,
        targetHandle: "in",
      });
      showToast(`已连接：${srcData.title ?? source.id} → ${suggestion.label}`);
    },
    [nodes, commitConnection, showToast],
  );

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      const source = nodes.find((n) => n.id === conn.source);
      const target = nodes.find((n) => n.id === conn.target);
      if (!source || !target || source.id === target.id) return false;
      const handle = (conn as Connection).targetHandle;
      // 界面节点只认左侧入口锚点：热点→热点的连线在交互流程图里没有语义
      if (target.type === "screen") return handle === HOTSPOT_IN;
      if (target.type === "decision" || target.type === "action") return !handle || handle === "in";
      return false;
    },
    [nodes],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid) return;
      const fromId = connectionState.fromNode?.id;
      if (!fromId) {
        showToast("只能连到界面的左侧入口 / 判断 / 动作节点");
        return;
      }
      // 松手落在卡片主体（不在任何锚点上）时 React Flow 不产生 toNode，
      // 这里按落点反查节点，视为「连到该卡片的入口锚点」，对齐 Figma 的连线手感。
      const point =
        "changedTouches" in event
          ? event.changedTouches[0]
          : event;
      const hitId = point
        ? document
            .elementsFromPoint(point.clientX, point.clientY)
            .find((el) => el.closest(".react-flow__node"))
            ?.closest(".react-flow__node")
            ?.getAttribute("data-id") ?? null
        : null;
      if (!hitId) {
        showToast("只能连到界面的左侧入口 / 判断 / 动作节点");
        return;
      }
      if (hitId === fromId) {
        showToast("不能连到起点卡片自己");
        return;
      }
      const target = nodes.find((n) => n.id === hitId);
      if (!target) {
        showToast("只能连到界面的左侧入口 / 判断 / 动作节点");
        return;
      }
      const connection: Connection = {
        source: fromId,
        sourceHandle: connectionState.fromHandle?.id ?? null,
        target: hitId,
        targetHandle: target.type === "screen" ? HOTSPOT_IN : "in",
      };
      if (!isValidConnection(connection)) {
        showToast("只能连到界面的左侧入口 / 判断 / 动作节点");
        return;
      }
      commitConnection(connection);
    },
    [commitConnection, isValidConnection, nodes, showToast],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) {
        showToast("只能连到界面的左侧入口 / 判断 / 动作节点");
        return;
      }
      commitConnection(connection);
    },
    [commitConnection, isValidConnection, showToast],
  );

  /* ---------- 属性修改 ---------- */
  const patchNodeData = useCallback(
    (id: string, patch: Record<string, unknown>, historyKey?: string) => {
      snapshot(historyKey);
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes, snapshot],
  );

  /** §8-4 标题原地编辑提交：与 Inspector 同一 historyKey（node:…:title），同卡连续编辑合并为一步撤销 */
  const patchTitle = useCallback(
    (id: string, title: string) => {
      patchNodeData(id, { title }, `node:${id}:title`);
    },
    [patchNodeData],
  );

  /** §8-5 多选对齐/等距分布：坐标补丁一次 setNodes，一条撤销记录；无变化的补丁不落盘 */
  const applyAlignActionToSelection = useCallback(
    (action: AlignAction) => {
      if (selNodeIds.length < 2) return;
      // 尺寸以 DOM 实测为准（裁剪开启时 RF store 的 measured 不总可靠），坐标仍是 flow 系
      const z = zoom > 0 ? zoom : 1;
      const domOf = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
      const boxes: AlignBox[] = [];
      for (const id of selNodeIds) {
        const el = domOf(id);
        const rect = el?.getBoundingClientRect();
        if (!el || !rect || rect.width <= 0 || rect.height <= 0) return; // 几何不可得（被裁剪/未挂载），跳过本次
        boxes.push({
          id,
          x: Number(el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)?.[1] ?? (rect.left / z)),
          y: Number(el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)?.[2] ?? (rect.top / z)),
          w: rect.width / z,
          h: rect.height / z,
        });
      }
      const patches = applyAlignAction(boxes, action);
      if (patches.length === 0) return;
      snapshot();
      setNodes((ns) =>
        ns.map((n) => {
          const p = patches.find((q) => q.id === n.id);
          return p ? { ...n, position: { ...n.position, x: p.x, y: p.y } } : n;
        }),
      );
    },
    [selNodeIds, zoom, setNodes, snapshot],
  );

  const patchScreen = useCallback(
    (id: string, patch: Partial<ScreenData>, historyKey?: string) => {
      snapshot(historyKey);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id
            ? { ...n, data: { ...(n.data as unknown as ScreenData), ...patch } as unknown as Record<string, unknown> }
            : n,
        ),
      );
    },
    [setNodes, snapshot],
  );

  const patchElement = useCallback(
    (nodeId: string, elId: string, patch: Partial<ScreenElement>, historyKey?: string) => {
      snapshot(historyKey);
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as unknown as ScreenData;
          return {
            ...n,
            data: {
              ...d,
              elements: d.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)),
            } as unknown as Record<string, unknown>,
          };
        }),
      );
    },
    [setNodes, snapshot],
  );

  /* ---------- 界面元素自由排版 ---------- */
  const freezeLayout = useCallback(
    (nodeId: string, boxes: Record<string, ElementBox>) => {
      snapshot();
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as unknown as ScreenData;
          return {
            ...n,
            data: {
              ...d,
              layout: "free",
              elements: d.elements.map((e) => ({ ...e, box: boxes[e.id] ?? e.box })),
            } as unknown as Record<string, unknown>,
          };
        }),
      );
    },
    [setNodes, snapshot],
  );

  const moveElement = useCallback(
    (nodeId: string, elId: string, box: ElementBox) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as unknown as ScreenData;
          return {
            ...n,
            data: { ...d, elements: d.elements.map((e) => (e.id === elId ? { ...e, box } : e)) } as unknown as Record<string, unknown>,
          };
        }),
      );
      // 元素动了 => 节点尺寸/锚点位置变了，重测一次让连线跟手
      window.requestAnimationFrame(() => updateNodeInternals([nodeId]));
    },
    [setNodes, updateNodeInternals],
  );

  const resizeElement = useCallback(
    (nodeId: string, elId: string, box: ElementBox) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as unknown as ScreenData;
          return {
            ...n,
            data: { ...d, elements: d.elements.map((e) => (e.id === elId ? { ...e, box } : e)) } as unknown as Record<string, unknown>,
          };
        }),
      );
      window.requestAnimationFrame(() => updateNodeInternals([nodeId]));
    },
    [setNodes, updateNodeInternals],
  );

  const reorderElement = useCallback(
    (nodeId: string, elId: string, action: ZOrderAction) => {
      snapshot();
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as unknown as ScreenData;
          return {
            ...n,
            data: { ...d, elements: moveElementZ(d.elements, elId, action) } as unknown as Record<string, unknown>,
          };
        }),
      );
    },
    [setNodes, snapshot],
  );

  const resetScreenLayout = useCallback(
    (nodeId: string) => {
      snapshot();
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as unknown as ScreenData;
          return {
            ...n,
            data: { ...d, layout: "stack", elements: d.elements.map((e) => ({ ...e, box: undefined })) } as unknown as Record<string, unknown>,
          };
        }),
      );
      window.setTimeout(() => updateNodeInternals([nodeId]), 60);
    },
    [setNodes, snapshot, updateNodeInternals],
  );

  /* ---------- 走查模式 ---------- */
  const walkHotspot = useCallback(
    (nodeId: string, elId: string) => {
      const link = edges.find((e) => e.source === nodeId && e.sourceHandle === elId);
      if (!link) {
        showToast("这个热点还没配置跳转，拖它右侧的圆点到目标界面即可");
        return;
      }
      // 走查只负责「跳到哪」：不带入变量，判断节点走默认分支
      const target = resolveFlowTarget(link.target, nodes, edges, {});
      if (!target) {
        showToast("这条连线最终没有落到界面节点上");
        return;
      }
      const tn = nodes.find((n) => n.id === target);
      // 走查只负责「跳到哪」，编辑选中仍交给画布点击本身
      setSelEdge(null);
      setFlashNode(target);
      window.setTimeout(() => setFlashNode((cur) => (cur === target ? null : cur)), 2600);
      if (tn) {
        const w = Number(tn.style?.width ?? 320);
        const h = Number(tn.measured?.height ?? 560);
        setCenter(tn.position.x + w / 2, tn.position.y + h / 2, { zoom: Math.min(1.05, Math.max(0.6, zoom)), duration: 520 });
      }
      showToast(`走查：${(tn?.data as unknown as ScreenData)?.title ?? "目标界面"}`);
    },
    [edges, nodes, setCenter, showToast, zoom],
  );

  const addElement = useCallback(
    (nodeId: string, kind: ScreenElement["kind"]) => {
      snapshot();
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as unknown as ScreenData;
          const nextEl: ScreenElement = {
            id: uid("el"),
            kind,
            label: kind === "button" ? "新按钮" : kind === "input" ? "新输入框" : kind === "text" ? "说明文字" : "新元素",
            hotspot: kind === "button" || kind === "input" || kind === "list-item" || kind === "card",
            action: kind === "button" ? "点击" : undefined,
          };
          return { ...n, data: { ...d, elements: d.elements.concat(nextEl) } as unknown as Record<string, unknown> };
        }),
      );
    },
    [setNodes, snapshot],
  );

  const removeElement = useCallback(
    (nodeId: string, elId: string) => {
      snapshot();
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const d = n.data as unknown as ScreenData;
          return {
            ...n,
            data: { ...d, elements: d.elements.filter((e) => e.id !== elId) } as unknown as Record<string, unknown>,
          };
        }),
      );
      const removedEdgeIds = new Set(
        edges.filter((e) => e.source === nodeId && e.sourceHandle === elId).map((e) => e.id),
      );
      setEdges((es) => es.filter((e) => !(e.source === nodeId && e.sourceHandle === elId)));
      setAnnotations((items) => items.filter((item) => !(item.targetType === "edge" && removedEdgeIds.has(item.targetId))));
    },
    [edges, setEdges, setNodes, snapshot],
  );

  const createLink = useCallback(
    (nodeId: string, hotspotId: string, targetNodeId: string) => {
      snapshot();
      const source = nodes.find((n) => n.id === nodeId);
      const d = source?.data as unknown as ScreenData | undefined;
      const el = d?.elements?.find((e) => e.id === hotspotId);
      const label = el ? `点击「${el.label ?? el.action ?? "热点"}」` : "跳转";
      setEdges((es) =>
        es.concat({
          id: uid("e"),
          source: nodeId,
          sourceHandle: hotspotId,
          target: targetNodeId,
          targetHandle: "in",
          type: "flow",
          markerEnd,
          data: { label },
        }),
      );
    },
    [markerEnd, nodes, setEdges, snapshot],
  );

  const patchEdge = useCallback(
    (id: string, patch: { label?: string; routeMode?: EdgeRouteMode; sourceHandle?: string }, historyKey?: string) => {
      const { sourceHandle, ...dataPatch } = patch;
      snapshot(historyKey);
      setEdges((es) =>
        es.map((e) =>
          e.id === id
            ? {
                ...e,
                ...(sourceHandle === undefined ? {} : { sourceHandle }),
                data: { ...e.data, ...dataPatch },
              }
            : e,
        ),
      );
    },    [setEdges, snapshot],
  );

  /** §8-4 stretch 连线标签原地编辑提交：与 Inspector 同一 historyKey（edge:…:label），同线连续编辑合并为一步撤销 */
  const patchEdgeLabel = useCallback(
    (id: string, label: string) => {
      patchEdge(id, { label }, `edge:${id}:label`);
    },
    [patchEdge],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      snapshot();
      setEdges((es) => es.filter((e) => e.id !== id));
      setAnnotations((items) => items.filter((item) => !(item.targetType === "edge" && item.targetId === id)));
      setSelEdge(null);
    },
    [setEdges, snapshot],
  );

  const deleteNode = useCallback(
    (id: string) => {
      snapshot();
      const removedEdgeIds = new Set(edges.filter((e) => e.source === id || e.target === id).map((e) => e.id));
      setNodes((ns) => cascadeDeleteNode(ns, id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      setAnnotations((items) => items.filter((item) => {
        if (item.targetType === "node" && item.targetId === id) return false;
        if (item.targetType === "edge" && removedEdgeIds.has(item.targetId)) return false;
        return true;
      }));
      setSelNode(null);
    },
    [edges, setEdges, setNodes, snapshot],
  );

  /* ---------- 整理布局：DFS 去回边 + 最长路径分层（能正确处理「返回 / 退出」形成的环） ---------- */
  const autoLayout = useCallback(() => {
    snapshot();
    const ids = nodes.map((n) => n.id);
    const idSet = new Set(ids);
    const adj = new Map<string, string[]>();
    ids.forEach((id) => adj.set(id, []));
    edges.forEach((e) => {
      if (idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target) {
        adj.get(e.source)!.push(e.target);
      }
    });

    // 1) DFS 找回边：指向「正在递归栈里」的点的边视为回边，不参与分层
    const color = new Map<string, 0 | 1 | 2>();
    ids.forEach((id) => color.set(id, 0));
    const back = new Set<string>();
    const visitFrom = (start: string) => {
      const stack: { id: string; i: number }[] = [{ id: start, i: 0 }];
      color.set(start, 1);
      while (stack.length) {
        const top = stack[stack.length - 1];
        const nexts = adj.get(top.id) ?? [];
        if (top.i >= nexts.length) {
          color.set(top.id, 2);
          stack.pop();
          continue;
        }
        const to = nexts[top.i++];
        const c = color.get(to) ?? 0;
        if (c === 1) {
          back.add(`${top.id}->${to}`);
          continue;
        }
        if (c === 0) {
          color.set(to, 1);
          stack.push({ id: to, i: 0 });
        }
      }
    };
    nodes
      .slice()
      .sort((a, b) => (a.type === "screen" ? 0 : 1) - (b.type === "screen" ? 0 : 1))
      .forEach((n) => {
        if ((color.get(n.id) ?? 0) === 0) visitFrom(n.id);
      });

    // 2) 在去边后的 DAG 上做最长路径分层
    const level = new Map<string, number>();
    const indeg = new Map<string, number>();
    ids.forEach((id) => {
      level.set(id, 0);
      indeg.set(id, 0);
    });
    edges.forEach((e) => {
      if (!idSet.has(e.source) || !idSet.has(e.target) || e.source === e.target) return;
      if (back.has(`${e.source}->${e.target}`)) return;
      indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    });
    const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
    const work = new Map(indeg);
    while (queue.length) {
      const id = queue.shift()!;
      const lv = level.get(id) ?? 0;
      (adj.get(id) ?? []).forEach((to) => {
        if (back.has(`${id}->${to}`)) return;
        level.set(to, Math.max(level.get(to) ?? 0, lv + 1));
        work.set(to, (work.get(to) ?? 1) - 1);
        if ((work.get(to) ?? 0) === 0) queue.push(to);
      });
    }

    // 3) 分列 + 列内按纵向顺序堆叠
    const heightOf = (n: Node) => (n.type === "screen" ? 650 : n.type === "decision" ? 130 : n.type === "note" ? 150 : 100);
    const columns = new Map<number, Node[]>();
    nodes.forEach((n) => {
      const lv = level.get(n.id) ?? 0;
      columns.set(lv, (columns.get(lv) ?? []).concat(n));
    });
    const positions = new Map<string, { x: number; y: number }>();
    [...columns.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([lv, list]) => {
        let y = 140;
        list
          .slice()
          .sort((a, b) => a.position.y - b.position.y)
          .forEach((n) => {
            positions.set(n.id, { x: 120 + lv * 470, y });
            y += heightOf(n) + 70;
          });
      });
    setNodes((ns) => ns.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })));
    window.setTimeout(() => fitView({ padding: 0.18, duration: 420 }), 30);
  }, [edges, fitView, nodes, setNodes, snapshot]);

  /* ---------- 导出 / 导入 ---------- */
  const exportJson = useCallback(() => {
    const exported = exportTextFile({
      filename: `flowcraft-${Date.now()}.json`,
      type: "application/json",
      content: JSON.stringify({ version: 3, nodes: canonicalNodes, edges, annotations }, null, 2),
    });
    showToast(
      exported
        ? `已导出流程 JSON：${canonicalNodes.length} 个节点 / ${edges.length} 条连线 / ${annotations.length} 条批注`
        : "导出 JSON 失败：浏览器无法创建下载，请重试或更换浏览器",
    );
  }, [annotations, canonicalNodes, edges, showToast]);

  const exportPrototype = useCallback(() => {
    try {
      const result = buildPrototypeHtml(nodes, edges, "FlowCraft 交互原型");
      if (!result.screens) {
        showToast("画布上还没有界面节点");
        return;
      }
      const exported = exportTextFile({
        filename: `flowcraft-prototype-${Date.now()}.html`,
        type: "text/html;charset=utf-8",
        content: result.html,
      });
      showToast(
        exported
          ? `已导出单文件原型：${result.screens} 个界面 / ${result.links} 条跳转`
          : "导出原型失败：浏览器无法创建下载，请重试或更换浏览器",
      );
    } catch {
      showToast("导出原型失败：界面快照生成失败，请重试");
    }
  }, [edges, nodes, showToast]);

  /**
   * 裁剪开启时 DOM 只有视口内节点；导出/打印克隆实时 DOM 前，
   * 先临时全量渲染并等 React Flow 测完所有节点，结束后恢复用户开关。
   */
  const withFullRender = useCallback(async (run: () => Promise<void> | void) => {
    if (!cull) {
      await run();
      return;
    }
    setRenderAllForExport(true);
    try {
      const deadline = performance.now() + 6000;
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        const measured = getNodes().filter((n) => (n.measured?.width ?? 0) > 0 && (n.measured?.height ?? 0) > 0).length;
        if (measured >= canonicalNodes.length || performance.now() > deadline) break;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await run();
    } finally {
      setRenderAllForExport(false);
    }
  }, [cull, canonicalNodes.length, getNodes]);

  const exportCanvasFile = useCallback(async (format: ExportFormat) => {
    if (exporting) return;
    setExporting(format);
    setMenuOpen(false);
    const labels: Record<ExportFormat, string> = { png: "PNG 图片", svg: "SVG 矢量图", pdf: "PDF 文档" };
    showToast(`正在导出 ${labels[format]}…`);
    try {
      await withFullRender(async () => {
        const { exportCanvas } = await import("./flow/exportCanvas");
        const result: CanvasExportResult = await exportCanvas(canonicalNodes, {
          format,
          title: "FlowCraft-流程图",
          pixelRatio: 2,
          onProgress: (message) => showToast(message),
        });
        const sizeText = result.bytes >= 1024 * 1024
          ? `${(result.bytes / 1024 / 1024).toFixed(1)} MB`
          : `${Math.max(1, Math.round(result.bytes / 1024))} KB`;
        showToast(`已导出 ${labels[format]}：${result.filename}（${sizeText}）`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      showToast(`导出 ${labels[format]} 失败：${message}`);
    } finally {
      setExporting(null);
    }
  }, [canonicalNodes, exporting, showToast, withFullRender]);

  const exportTemplates = useCallback(() => {
    const bundle = buildTemplateBundle(customTemplates);
    if (!bundle.templates.length) {
      showToast("还没有可导出的自定义模板，先选中界面并保存为模板");
      return;
    }
    const exported = exportTextFile({
      filename: `flowcraft-templates-${Date.now()}.json`,
      type: "application/json",
      content: JSON.stringify(bundle, null, 2),
    });
    showToast(exported ? `已导出 ${bundle.templates.length} 个模板` : "模板导出失败，请重试或更换浏览器");
  }, [customTemplates, showToast]);

  const importTemplates = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const bundle = parseTemplateBundle(text);
      if (!bundle) throw new Error("模板文件格式不正确");
      setCustomTemplates((existing) => mergeTemplates(existing, bundle.templates));
      showToast(`已导入 ${bundle.templates.length} 个模板`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "模板导入失败，请检查文件";
      showToast(message);
    }
  }, [showToast]);

  const importJson = useCallback(
    (file: File) => {
      void file.text().then((text) => {
        const result = parseFlowFile(text);
        if (!result.ok) {
          setImportReport(result);
          showToast(summarizeImport(result));
          return;
        }
        snapshot();
        setNodes(migrateLegacyNoteAnchors(result.nodes));
        setEdges(result.edges);
        setAnnotations(result.annotations);
        setSelNode(null);
        setSelEdge(null);
        setImportReport(result.issues.length || result.migrations.length ? result : null);
        window.setTimeout(() => fitView({ padding: 0.18 }), 40);
        showToast(summarizeImport(result));
      });
    },
    [fitView, setEdges, setNodes, showToast, snapshot],
  );

  const printFlow = useCallback(() => {
    // 按 A3 横向纸张比例把整图缩放好，再交给系统打印（可直接另存为 PDF）
    const viewport = getViewportForBounds(getNodesBounds(canonicalNodes), 1587, 1122, 0.15, 2, 0.05);
    void withFullRender(async () => {
      setViewport(viewport);
      // 等 transform 动画落位；window.print() 在 Chromium 里同步阻塞，DOM 保持全量
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      window.print();
    });
  }, [canonicalNodes, setViewport, withFullRender]);

  const addAnnotation = useCallback((annotation: Annotation) => {
    setAnnotations((items) => items.some((item) => item.id === annotation.id) ? items : items.concat(annotation));
  }, []);

  const patchAnnotation = useCallback((annotation: Annotation) => {
    setAnnotations((items) => updateAnnotation(items, annotation.id, {
      content: annotation.content,
      color: annotation.color,
      targetType: annotation.targetType,
      targetId: annotation.targetId,
    }, annotation.updatedAt));
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((items) => deleteAnnotation(items, id));
  }, []);

  const resetSample = useCallback(() => {
    snapshot();
    setNodes(initialNodes.map((n) => ({ ...n })));
    setEdges(initialEdges.map((e) => ({ ...e })));
    setAnnotations([]);
    setSelNode(null);
    setSelEdge(null);
    window.setTimeout(() => fitView({ padding: 0.18, duration: 400 }), 30);
  }, [fitView, setEdges, setNodes, snapshot]);

  /* ---------- 键盘快捷键 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        exportJson();
        return;
      }
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Ctrl/⌘+K：唤起画布常驻 AI 输入条（在输入框里也生效，方便从别处跳过来）
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAiOpen(false);
        setAiBarOpen(true);
        requestAnimationFrame(() => aiBarInputRef.current?.focus());
        return;
      }
      if (e.key === "Escape") {
        if (aiBarOpen) {
          setAiBarOpen(false);
          return;
        }
        if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery("");
          return;
        }
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        if (inspectorOpen) {
          setInspectorOpen(false);
          return;
        }
        if (snapOpen) {
          setSnapOpen(false);
          return;
        }
        if (healthOpen) {
          setHealthOpen(false);
          return;
        }
      }
      if (typing) return;
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPreviewStart(selNode ?? nodes.find((n) => n.type === "screen")?.id ?? null);
        setPreview(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (!selNode) return;
        const n = nodes.find((x) => x.id === selNode);
        if (!n) return;
        snapshot();
        const clone: Node = {
          ...n,
          id: uid(n.type === "screen" ? "n" : (n.type ?? "x").slice(0, 1)),
          position: { x: n.position.x + 48, y: n.position.y + 48 },
          selected: false,
          data: JSON.parse(JSON.stringify(n.data)),
        };
        setNodes((ns) => ns.concat(clone));
        setSelNode(clone.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiBarOpen, exportJson, healthOpen, inspectorOpen, nodes, paletteOpen, redo, searchOpen, selNode, setNodes, snapOpen, snapshot, undo]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selNode), [nodes, selNode]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selEdge), [edges, selEdge]);

  /** 选中节点的上下文：AI 面板顶部显示它的连线状态与快捷建议（screen/decision/action）。 */
  const selectedScreenContext = useMemo(() => {
    const node = selectedNode;
    if (!node || node.type === "note") return null;
    const data = node.data as unknown as ScreenData & DecisionData;
    const title = typeof data?.title === "string" ? data.title : node.id;
    const outEdges = edges.filter((e) => e.source === node.id);
    const inEdges = edges.filter((e) => e.target === node.id);

    // decision：体检同一套判定——缺「是」或「否」出口即分支不全（复用 flowHealth 语义）
    if (node.type === "decision") {
      const hasYes = outEdges.some((e) => e.sourceHandle === "yes");
      const hasNo = outEdges.some((e) => e.sourceHandle === "no");
      const missing = [!hasYes ? data.yes ?? "是" : null, !hasNo ? data.no ?? "否" : null].filter(Boolean).join("、");
      return {
        id: node.id,
        title,
        kind: "decision" as const,
        inCount: inEdges.length,
        outCount: outEdges.length,
        deadEnd: outEdges.length === 0,
        branchMissing: missing || null,
        suggestion: null,
      };
    }

    const deadEnd = outEdges.length === 0;
    // 这张卡的死路补线建议（若有），点「采纳」即可接上
    const suggestion = deadEnd && node.type === "screen" ? wireSuggestions.find((s) => s.source === node.id) ?? null : null;
    return {
      id: node.id,
      title,
      kind: node.type === "screen" ? ("screen" as const) : ("action" as const),
      inCount: inEdges.length,
      outCount: outEdges.length,
      deadEnd,
      branchMissing: null,
      suggestion,
    };
  }, [selectedNode, edges, wireSuggestions]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const out: SearchItem[] = [];
    nodes.forEach((node) => {
      const data = node.data as Record<string, unknown>;
      const title = typeof data.title === "string" ? data.title : node.id;
      const subtitle = typeof data.subtitle === "string" ? data.subtitle : "";
      const body = typeof data.body === "string" ? data.body : "";
      const elements = Array.isArray(data.elements) ? (data.elements as ScreenElement[]) : [];
      const element = elements.find((el) =>
        [el.label, el.sublabel, el.placeholder, el.action].some((text) => typeof text === "string" && text.toLowerCase().includes(query)),
      );
      if (title.toLowerCase().includes(query)) {
        out.push({ key: `node:${node.id}`, kind: "node", id: node.id, nodeId: node.id, title, detail: "界面 / 节点" });
      } else if (element) {
        out.push({
          key: `node:${node.id}:${element.id}`,
          kind: "node",
          id: node.id,
          nodeId: node.id,
          title,
          detail: `元素：${element.label ?? element.placeholder ?? element.action ?? element.id}`,
        });
      } else if (subtitle.toLowerCase().includes(query) || body.toLowerCase().includes(query)) {
        out.push({ key: `node:${node.id}`, kind: "node", id: node.id, nodeId: node.id, title, detail: subtitle || body });
      }
    });
    edges.forEach((edge) => {
      const label = typeof edge.data?.label === "string" ? edge.data.label : "";
      if (label.toLowerCase().includes(query)) {
        const source = nodes.find((n) => n.id === edge.source);
        const sourceTitle = (source?.data as Record<string, unknown> | undefined)?.title;
        out.push({
          key: `edge:${edge.id}`,
          kind: "edge",
          id: edge.id,
          nodeId: edge.source,
          title: label,
          detail: `连线来自：${typeof sourceTitle === "string" ? sourceTitle : edge.source}`,
        });
      }
    });
    return out.slice(0, 30);
  }, [edges, nodes, searchQuery]);

  const focusSearchResult = useCallback(
    (result: SearchItem) => {
      const node = nodes.find((n) => n.id === result.nodeId);
      if (!node) return;
      const width = node.measured?.width ?? (typeof node.style?.width === "number" ? node.style.width : 320);
      const height = node.measured?.height ?? 420;
      setSearchOpen(false);
      setSearchQuery("");
      setSelNode(result.kind === "node" ? result.id : null);
      setSelEdge(result.kind === "edge" ? result.id : null);
      setNodes((ns) =>
        ns.map((item) => {
          const selected = result.kind === "node" && item.id === result.id;
          return item.selected === selected ? item : { ...item, selected };
        }),
      );
      setEdges((es) =>
        es.map((item) => {
          const selected = result.kind === "edge" && item.id === result.id;
          return item.selected === selected ? item : { ...item, selected };
        }),
      );
      setFlashNode(node.id);
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.min(1.05, Math.max(0.65, zoom)),
        duration: 480,
      });
      window.setTimeout(() => setFlashNode((current) => (current === node.id ? null : current)), 1800);
    },
    [nodes, setCenter, setEdges, setNodes, zoom],
  );

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [searchOpen]);

  /* ---------- 多画布 / 快照 / 体检 ---------- */
  const canvasEnabled = !exampleMode && !bench;
  const activeCanvas = useMemo(() => canvases.find((c) => c.id === activeCanvasId) ?? null, [canvases, activeCanvasId]);

  /** 评审报告：界面清单 / 连线 / 条件 / 批注 / 体检拼成一页，PM 直接贴需求文档。
   *  依赖 activeCanvas（画布名做标题），所以定义在多画布区块而不是导出区块。 */
  const exportReviewReport = useCallback(() => {
    const report = buildReportHtml(canonicalNodes, edges, annotations, {
      title: activeCanvas?.name ?? "FlowCraft 流程评审报告",
    });
    if (!report.screens) {
      showToast("画布上还没有界面节点，先搭流程再导出报告");
      return;
    }
    const exported = exportTextFile({
      filename: `flowcraft-report-${Date.now()}.html`,
      type: "text/html;charset=utf-8",
      content: report.html,
    });
    showToast(
      exported
        ? `已导出评审报告：${report.screens} 个界面 / ${report.issues ? `${report.issues} 项体检待确认` : "体检通过"}`
        : "导出评审报告失败：浏览器无法创建下载，请重试",
    );
  }, [activeCanvas, annotations, canonicalNodes, edges, showToast]);


  const openCanvasMenu = useCallback(() => {
    const rect = canvasMenuRef.current?.getBoundingClientRect();
    setCanvasMenuPosition(rect ? { left: rect.left, top: rect.bottom + 6, width: rect.width } : null);
    setCanvasMenuOpen((v) => !v);
    setRenamingCanvasId(null);
    setConfirmDeleteCanvasId(null);
  }, []);

  /** 归档当前画布数据并切换：flow.v1 始终是活动画布的镜像 */
  const loadCanvasContent = useCallback(
    (id: string) => {
      const data = readCanvasData(localStorage, id);
      snapshot();
      setNodes(data ? migrateLegacyNoteAnchors(data.nodes) : []);
      setEdges(data?.edges ?? []);
      setAnnotations(data?.annotations ?? []);
      setSelNode(null);
      setSelEdge(null);
      writeActiveCanvasId(localStorage, id);
      setActiveCanvasId(id);
      setDiffView(null);
      window.setTimeout(() => fitView({ padding: 0.16, minZoom: 0.4, maxZoom: 0.9, duration: 360 }), 240);
    },
    [fitView, setEdges, setNodes, snapshot],
  );

  const switchCanvas = useCallback(
    (id: string) => {
      if (!canvasEnabled || !activeCanvasId || id === activeCanvasId) return;
      if (!canvases.some((c) => c.id === id)) return;
      writeCanvasData(localStorage, activeCanvasId, { nodes: canonicalNodes, edges, annotations });
      // 切走前给当前画布拍一张自动快照，防止误切丢内容
      const list = addSnapshot(localStorage, activeCanvasId, {
        id: uid("s"),
        name: autoSnapshotName(),
        createdAt: Date.now(),
        auto: true,
        data: { nodes: canonicalNodes, edges, annotations },
      });
      if (activeCanvasId) setSnapshots(list.slice());
      const target = canvases.find((c) => c.id === id);
      loadCanvasContent(id);
      setSnapshots(readSnapshots(localStorage, id));
      setCanvasMenuOpen(false);
      showToast(`已切换到「${target?.name ?? id}」，切换前的内容已自动存快照`);
    },
    [canvasEnabled, activeCanvasId, canvases, canonicalNodes, edges, annotations, loadCanvasContent, showToast],
  );

  const createCanvas = useCallback(() => {
    if (!canvasEnabled) return;
    if (canvases.length >= 20) {
      showToast("画布数量已达上限（20 个），先删除不用的画布");
      return;
    }
    const id = uid("c");
    const name = uniqueCanvasName(canvases, "新画布");
    writeCanvasData(localStorage, id, { nodes: [], edges: [], annotations: [] });
    const list = [...canvases, newCanvasMeta(name, id)];
    writeCanvasList(localStorage, list);
    setCanvases(list);
    if (activeCanvasId) {
      writeCanvasData(localStorage, activeCanvasId, { nodes: canonicalNodes, edges, annotations });
      addSnapshot(localStorage, activeCanvasId, {
        id: uid("s"),
        name: autoSnapshotName(),
        createdAt: Date.now(),
        auto: true,
        data: { nodes: canonicalNodes, edges, annotations },
      });
    }
    loadCanvasContent(id);
    setCanvasMenuOpen(false);
    showToast(`已创建「${name}」`);
  }, [canvasEnabled, canvases, activeCanvasId, canonicalNodes, edges, annotations, loadCanvasContent, showToast]);

  const renameCanvas = useCallback(
    (id: string, rawName: string) => {
      const name = sanitizeCanvasName(rawName);
      if (!name) {
        setRenamingCanvasId(null);
        return;
      }
      const list = canvases.map((c) => (c.id === id ? { ...c, name, updatedAt: Date.now() } : c));
      writeCanvasList(localStorage, list);
      setCanvases(list);
      setRenamingCanvasId(null);
    },
    [canvases],
  );

  const duplicateCanvas = useCallback(
    (id: string) => {
      if (!canvasEnabled) return;
      const source = canvases.find((c) => c.id === id);
      if (!source) return;
      if (canvases.length >= 20) {
        showToast("画布数量已达上限（20 个），先删除不用的画布");
        return;
      }
      const data = id === activeCanvasId ? { nodes: canonicalNodes, edges, annotations } : readCanvasData(localStorage, id);
      const newId = uid("c");
      writeCanvasData(localStorage, newId, data ?? { nodes: [], edges: [], annotations: [] });
      const list = [...canvases, newCanvasMeta(uniqueCanvasName(canvases, `${source.name} 副本`), newId)];
      writeCanvasList(localStorage, list);
      setCanvases(list);
      showToast(`已复制为「${list[list.length - 1].name}」`);
    },
    [canvasEnabled, canvases, activeCanvasId, canonicalNodes, edges, annotations, showToast],
  );

  const deleteCanvas = useCallback(
    (id: string) => {
      if (!canvasEnabled) return;
      if (canvases.length <= 1) {
        showToast("至少保留一个画布");
        return;
      }
      const target = canvases.find((c) => c.id === id);
      const list = canvases.filter((c) => c.id !== id);
      removeCanvasData(localStorage, id);
      localStorage.removeItem(`flowcraft.snapshots.${id}`);
      writeCanvasList(localStorage, list);
      setCanvases(list);
      setConfirmDeleteCanvasId(null);
      if (id === activeCanvasId) {
        loadCanvasContent(list[0].id);
        showToast(`已删除「${target?.name ?? id}」，切换到「${list[0].name}」`);
      } else {
        showToast(`已删除「${target?.name ?? id}」`);
      }
    },
    [canvasEnabled, canvases, activeCanvasId, loadCanvasContent, showToast],
  );

  const refreshSnapshots = useCallback(
    (id: string = activeCanvasId ?? "") => {
      setSnapshots(id ? readSnapshots(localStorage, id) : []);
      setDiffView(null);
    },
    [activeCanvasId],
  );

  const takeSnapshot = useCallback(() => {
    if (!canvasEnabled || !activeCanvasId) return;
    const snap: FlowSnapshot = {
      id: uid("s"),
      name: uniqueCanvasName(
        snapshots.map((s) => ({ id: s.id, name: s.name, createdAt: s.createdAt, updatedAt: s.createdAt })),
        `快照 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
      ),
      createdAt: Date.now(),
      auto: false,
      data: { nodes: canonicalNodes, edges, annotations },
    };
    setSnapshots(addSnapshot(localStorage, activeCanvasId, snap));
    showToast("已拍摄快照，可在快照面板对比或恢复");
  }, [canvasEnabled, activeCanvasId, snapshots, canonicalNodes, edges, annotations, showToast]);

  const restoreSnapshot = useCallback(
    (snap: FlowSnapshot) => {
      if (!canvasEnabled || !activeCanvasId) return;
      writeCanvasData(localStorage, activeCanvasId, { nodes: canonicalNodes, edges, annotations });
      const list = addSnapshot(localStorage, activeCanvasId, {
        id: uid("s"),
        name: autoSnapshotName(),
        createdAt: Date.now(),
        auto: true,
        data: { nodes: canonicalNodes, edges, annotations },
      });
      setSnapshots(list);
      snapshot();
      setNodes(migrateLegacyNoteAnchors(snap.data.nodes));
      setEdges(snap.data.edges);
      setAnnotations(snap.data.annotations);
      setSelNode(null);
      setSelEdge(null);
      setDiffView(null);
      window.setTimeout(() => fitView({ padding: 0.16, minZoom: 0.4, maxZoom: 0.9, duration: 360 }), 240);
      showToast(`已恢复「${snap.name}」，恢复前的内容已自动存快照`);
    },
    [canvasEnabled, activeCanvasId, canonicalNodes, edges, annotations, snapshot, setEdges, setNodes, fitView, showToast],
  );

  const compareSnapshot = useCallback(
    (snap: FlowSnapshot) => {
      const diff = diffFlows(snap.data, { nodes: canonicalNodes, edges, annotations });
      setDiffView({ name: snap.name, diff });
    },
    [canonicalNodes, edges, annotations],
  );

  const deleteSnapshotById = useCallback(
    (snapId: string) => {
      if (!activeCanvasId) return;
      setSnapshots(removeSnapshot(localStorage, activeCanvasId, snapId));
    },
    [activeCanvasId],
  );

  const renameSnapshotById = useCallback(
    (snapId: string, rawName: string) => {
      if (!activeCanvasId) return;
      setSnapshots(renameSnapshot(localStorage, activeCanvasId, snapId, rawName));
      setRenamingSnapId(null);
    },
    [activeCanvasId],
  );

  // QA 探针：每轮 Ego 回归从 window.__fcQA.collect() 拿确定性断言数据（docs/ego-smoke.md）
  useEffect(() => {
    installQaProbe(() => ({ nodes: canonicalNodes, edges }));
  }, [canonicalNodes, edges]);

  const healthIssues = useMemo(() => (canvasEnabled ? scanFlowHealth(canonicalNodes, edges) : []), [canvasEnabled, canonicalNodes, edges]);

  const focusHealthIssue = useCallback(
    (issue: HealthIssue) => {
      const node = nodes.find((n) => n.id === issue.nodeId);
      if (!node) return;
      const width = node.measured?.width ?? (typeof node.style?.width === "number" ? node.style.width : 320);
      const height = node.measured?.height ?? 420;
      setSelNode(issue.nodeId);
      setSelEdge(null);
      setNodes((ns) => ns.map((item) => ({ ...item, selected: item.id === issue.nodeId })));
      setFlashNode(node.id);
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.min(1.05, Math.max(0.65, zoom)),
        duration: 480,
      });
      window.setTimeout(() => setFlashNode((current) => (current === node.id ? null : current)), 1800);
    },
    [nodes, setCenter, setNodes, zoom],
  );

  const stats = useMemo(
    () => ({ screens: nodes.filter((n) => n.type === "screen").length, links: edges.length }),
    [nodes, edges],
  );
  const canUndo = historyVersion >= 0 && past.current.length > 0;
  const canRedo = historyVersion >= 0 && future.current.length > 0;

  const unlinkedHotspotKeys = useMemo(() => {
    if (!showHotspots || walkMode || preview) return EMPTY_HOTSPOT_KEYS;
    const linked = new Set(edges.map((edge) => `${edge.source}:${edge.sourceHandle ?? ""}`));
    const unlinked = new Set<string>();
    nodes.forEach((node) => {
      if (node.type !== "screen") return;
      const data = node.data as unknown as ScreenData;
      data.elements.forEach((element) => {
        if (element.hotspot) {
          const key = `${node.id}:${element.id}`;
          if (!linked.has(key)) unlinked.add(key);
        }
      });
    });
    return unlinked;
  }, [edges, nodes, preview, showHotspots, walkMode]);
  // §8-1 死路提示：编辑期常开（不受 showHotspots 门控），走查/预览下不渲染
  const deadHints = useMemo(
    () => (walkMode || preview ? undefined : computeDeadHints(canonicalNodes, edges)),
    [canonicalNodes, edges, walkMode, preview],
  );
  const editorCtx = useMemo(
    () => ({ showHotspots, walkMode, zoom, preview, patchTitle, patchEdgeLabel, freezeLayout, moveElement, resizeElement, walkHotspot, unlinkedHotspotKeys, deadHints }),
    [showHotspots, walkMode, zoom, preview, patchTitle, patchEdgeLabel, freezeLayout, moveElement, resizeElement, walkHotspot, unlinkedHotspotKeys, deadHints],
  );
  const viewNodes = useMemo(
    () => canonicalNodes.map((n) => (n.id === flashNode ? { ...n, className: "fc-flash" } : n)),
    [canonicalNodes, flashNode],
  );

  return (
    <EditorContext.Provider value={editorCtx}>
      <div className="fc-app" style={{ "--fc-zoom": zoom } as CSSProperties}>
        <header className="fc-topbar">
          <div className="fc-brand" aria-label="FlowCraft 交互流程图">
            <span className="fc-brand-mark"><Icon name="layers" size={15} /></span>
            <span className="fc-brand-name">FlowCraft</span>
            <span className="fc-brand-sub">交互流程图</span>
          </div>

          <div className="fc-toolbar" aria-label="编辑器工具栏">
            {canvasEnabled ? (
              <div className="fc-toolbar-group" aria-label="画布">
                <div className="fc-menu" ref={canvasMenuRef}>
                  <button
                    type="button"
                    className={`fc-btn fc-canvas-toggle${canvasMenuOpen ? " is-active" : ""}`}
                    onClick={openCanvasMenu}
                    title="画布列表：切换 / 新建 / 重命名 / 复制 / 删除"
                    aria-haspopup="menu"
                    aria-expanded={canvasMenuOpen}
                  >
                    <Icon name="layers" size={14} />
                    <span className="fc-canvas-name">{activeCanvas?.name ?? "画布"}</span>
                    <span className="fc-menu-caret">▾</span>
                  </button>
                </div>
              </div>
            ) : null}
            <div className="fc-toolbar-group" aria-label="编辑">
              <button className="fc-icon-btn-inline" onClick={undo} title="撤销（Ctrl+Z）" aria-label="撤销" disabled={!canUndo}>
                <Icon name="undo" size={15} />
              </button>
              <button className="fc-icon-btn-inline" onClick={redo} title="重做（Ctrl+Shift+Z）" aria-label="重做" disabled={!canRedo}>
                <Icon name="redo" size={15} />
              </button>
            </div>

            <div className="fc-toolbar-group" aria-label="视图">
              <button className="fc-icon-btn-inline" onClick={() => fitView({ padding: 0.18, duration: 380 })} title="让全部内容适应当前窗口" aria-label="适应画布">
                <Icon name="fit" size={15} />
              </button>
              <button className="fc-icon-btn-inline" onClick={autoLayout} title="自动整理节点位置" aria-label="整理布局">
                <Icon name="layout" size={15} />
              </button>
              <button className={`fc-icon-btn-inline fc-cull-toggle${cull ? " is-active" : ""}`} onClick={() => setCull((v) => !v)} title="可视区裁剪：只渲染窗口内的节点与连线，大图更流畅（导出/打印时自动全量渲染）" aria-label="可视区裁剪" aria-pressed={cull}>
                <Icon name="crop" size={15} />
              </button>
              <button className={`fc-icon-btn-inline${showHotspots ? " is-active" : ""}`} onClick={() => setShowHotspots((v) => !v)} title="显示或隐藏可点击热点" aria-label="显示热点" aria-pressed={showHotspots}>
                <Icon name="link" size={15} />
              </button>
              <button className={`fc-icon-btn-inline fc-walk-toggle${walkMode ? " is-active" : ""}`} onClick={() => {
                setWalkMode((v) => !v);
                showToast(walkMode ? "已退出走查模式" : "走查模式：点击界面里的控件，直接跳到目标界面");
              }} title="走查：点击热点查看跳转目标" aria-label="走查模式" aria-pressed={walkMode}>
                <Icon name="compass" size={15} />
              </button>
              <button className={`fc-icon-btn-inline fc-search-toggle${searchOpen ? " is-active" : ""}`} onClick={() => setSearchOpen((v) => !v)} title="搜索界面、元素和连线（Ctrl+F）" aria-label="搜索">
                <Icon name="search" size={15} />
              </button>
            </div>

            {canvasEnabled ? (
              <div className="fc-toolbar-group" aria-label="检查">
                <button
                  className={`fc-icon-btn-inline${healthOpen ? " is-active" : ""}`}
                  onClick={() => { setHealthOpen((v) => !v); setSnapOpen(false); }}
                  title="流程体检：死路界面 / 孤立界面 / 未接线主按钮 / 判断分支不全"
                  aria-label="流程体检"
                  aria-pressed={healthOpen}
                >
                  <Icon name="check" size={15} />
                </button>
                <button
                  className={`fc-icon-btn-inline${snapOpen ? " is-active" : ""}`}
                  onClick={() => { if (!snapOpen) refreshSnapshots(); setSnapOpen((v) => !v); setHealthOpen(false); }}
                  title="快照与版本对比：拍摄 / 对比 / 恢复"
                  aria-label="快照与版本对比"
                  aria-pressed={snapOpen}
                >
                  <Icon name="stack" size={15} />
                </button>
              </div>
            ) : null}

            <span className="fc-toolbar-divider" role="presentation" />

            <div className="fc-toolbar-group fc-toolbar-group-ai" aria-label="AI 与视图">
              <button
                type="button"
                className={`fc-icon-btn-inline fc-ai-toggle${aiOpen ? " is-active" : ""}`}
                onClick={() => { setAiOpen((v) => !v); setHealthOpen(false); setSnapOpen(false); }}
                title="AI 助手：描述流程自动生成画布 / 智能补线"
                aria-label="AI 助手"
                aria-pressed={aiOpen}
              >
                <Icon name="sparkle" size={15} />
              </button>
              <button
                type="button"
                className="fc-icon-btn-inline fc-theme-toggle"
                onClick={() => setTheme((current) => nextTheme(current))}
                title={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}
                aria-label={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}
                aria-pressed={theme === "dark"}
              >
                <Icon name={theme === "light" ? "moon" : "sun"} size={15} />
              </button>
            </div>

            <span className="fc-toolbar-spacer" />

            <button className="fc-btn fc-btn-secondary fc-resource-toggle" onClick={() => { setPaletteOpen((open) => !open); setInspectorOpen(false); }} title={paletteOpen ? "关闭资源库" : "打开模板和流程节点"} aria-controls="fc-palette-drawer" aria-expanded={paletteOpen}>
              <Icon name="panelLeft" size={15} /> <span className="fc-resource-label">资源库</span>
            </button>
            <button className="fc-icon-btn-inline fc-inspector-toggle" onClick={() => { setInspectorOpen((open) => !open); setPaletteOpen(false); }} title={inspectorOpen ? "关闭属性面板" : "打开属性面板"} aria-label={inspectorOpen ? "关闭属性面板" : "打开属性面板"} aria-controls="fc-inspector-panel" aria-expanded={inspectorOpen}>
              <Icon name="panelRight" size={15} />
            </button>

            <div className="fc-menu" ref={menuRef}>
              <button
                className={`fc-btn${menuOpen ? " is-active" : ""}`}
                onClick={() => {
                  const rect = menuRef.current?.getBoundingClientRect();
                  if (rect) setMenuPosition({ left: rect.left, top: rect.bottom + 8, width: rect.width });
                  setMenuOpen((v) => !v);
                }}
                title="导入或导出流程、图片和原型"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                文件 <Icon name="chevronDown" size={13} />
              </button>
              {menuOpen && menuPosition
                ? createPortal(
                    <div className="fc-menu-panel" role="menu" style={{ left: menuPosition.left, top: menuPosition.top, minWidth: Math.max(220, menuPosition.width) }}>
                      <button role="menuitem" disabled={!!exporting || nodes.length === 0} onClick={() => void exportCanvasFile("png")}>
                        {exporting === "png" ? "正在导出 PNG…" : "导出 PNG 图片"} <span>高清整图，适合分享</span>
                      </button>
                      <button role="menuitem" disabled={!!exporting || nodes.length === 0} onClick={() => void exportCanvasFile("svg")}>
                        {exporting === "svg" ? "正在导出 SVG…" : "导出 SVG 矢量图"} <span>可缩放，适合设计稿</span>
                      </button>
                      <button role="menuitem" disabled={!!exporting || nodes.length === 0} onClick={() => void exportCanvasFile("pdf")}>
                        {exporting === "pdf" ? "正在导出 PDF…" : "导出 PDF 文档"} <span>A3 横向，适合评审</span>
                      </button>
                      <button role="menuitem" onClick={() => { exportPrototype(); setMenuOpen(false); }}>
                        导出交互原型 <span>单文件 HTML，可离线点击</span>
                      </button>
                      <button role="menuitem" disabled={nodes.length === 0} onClick={() => { exportReviewReport(); setMenuOpen(false); }}>
                        导出评审报告 <span>界面 / 连线 / 条件 / 批注 / 体检 一页看清</span>
                      </button>
                      <button role="menuitem" onClick={() => { exportJson(); setMenuOpen(false); }}>
                        导出流程 JSON <span>含批注，可备份与版本管理</span>
                      </button>
                      <button role="menuitem" onClick={() => { printFlow(); setMenuOpen(false); }}>
                        打印 / 另存 PDF <span>使用系统打印</span>
                      </button>
                      <button role="menuitem" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}>
                        导入流程 JSON
                      </button>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          </div>

          <div className="fc-status" aria-label="流程统计">
            <span>{stats.screens} 个界面</span>
            <span>{stats.links} 条连线</span>
            {saveFailed ? (
              <span className="fc-save-error">本地保存失败，请导出备份</span>
            ) : (
              <span className="fc-saved"><Icon name="check" size={12} /> 已存本地 {saved}</span>
            )}
          </div>
          <button
            className="fc-btn fc-btn-primary fc-preview-btn"
            onClick={() => {
              setPreviewStart(selNode ?? nodes.find((n) => n.type === "screen")?.id ?? null);
              setPreview(true);
            }}
            title="从当前选中的界面开始预览（P）"
          >
            <Icon name="play" size={14} /> 预览 <kbd>P</kbd>
          </button>
        </header>

        {searchOpen ? (
          <section className="fc-search-panel" aria-label="搜索画布">
            <input
              ref={searchInputRef}
              className="fc-search-input"
              value={searchQuery}
              placeholder="搜索界面、元素文案、连线标签…"
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const first = searchResults[0];
                  if (first) focusSearchResult(first);
                }
              }}
            />
            <span className="fc-search-count">
              {searchQuery.trim() ? `${searchResults.length} 个结果` : "Ctrl+F"}
            </span>
            {searchQuery.trim() ? (
              <div className="fc-search-results">
                {searchResults.length ? (
                  searchResults.map((result) => (
                    <button key={result.key} onClick={() => focusSearchResult(result)}>
                      <b>{result.title}</b>
                      <span>{result.detail}</span>
                    </button>
                  ))
                ) : (
                  <p>没有匹配的界面、元素或连线</p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {healthOpen ? (
          <section className="fc-search-panel fc-health-panel" aria-label="流程体检">
            <div className="fc-panel-head">
              <b>流程体检</b>
              <span>{healthIssues.length ? `${healthIssues.length} 个待确认项` : "没有发现问题"}</span>
            </div>
            {healthIssues.length ? (
              <div className="fc-search-results">
                {healthIssues.map((issue) => (
                  <button key={issue.id} onClick={() => focusHealthIssue(issue)}>
                    <b>【{HEALTH_KIND_LABEL[issue.kind]}】{issue.title}</b>
                    <span>{issue.detail}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="fc-health-ok">流程看起来是通的：没有死路、孤立界面、未接线主按钮或缺失分支。</p>
            )}
          </section>
        ) : null}

        {aiOpen ? (() => {
          return (
            <section
              ref={aiPanel.ref}
              className={`fc-search-panel fc-ai-panel${aiPanel.pos ? " is-floating" : ""}`}
              style={aiPanel.pos ? { left: aiPanel.pos.x, top: aiPanel.pos.y, right: "auto" } : undefined}
              aria-label="AI 助手"
            >
              <div
                className="fc-panel-head fc-ai-head"
                onPointerDown={aiPanel.onDragStart}
                onDoubleClick={aiPanel.reset}
                title="拖动移动面板 · 双击复位"
              >
                <b><span className="fc-ai-badge" aria-hidden="true"><Icon name="sparkle" size={11} /></span>AI 助手</b>
                <span className="fc-ai-head-hint" aria-hidden="true"><Icon name="grip" size={12} /> 拖动移动</span>
              </div>
              {selectedScreenContext ? (
                <div className={`fc-ai-context${selectedScreenContext.branchMissing ? " is-dead" : selectedScreenContext.deadEnd ? " is-dead" : ""}`}>
                  <div className="fc-ai-context-row">
                    <span className="fc-ai-context-title" title={selectedScreenContext.title}>
                      {selectedScreenContext.branchMissing ? "🔀" : selectedScreenContext.deadEnd ? "🚧" : "✅"} {selectedScreenContext.title}
                    </span>
                    <span className="fc-ai-context-meta">
                      入 {selectedScreenContext.inCount} · 出 {selectedScreenContext.outCount}
                    </span>
                  </div>
                  {selectedScreenContext.branchMissing ? (
                    <span className="fc-ai-context-note">判断分支不全：缺「{selectedScreenContext.branchMissing}」出口；原型走查会按默认「是」处理</span>
                  ) : selectedScreenContext.deadEnd && selectedScreenContext.suggestion ? (
                    <button
                      type="button"
                      className="fc-ai-context-fix"
                      onClick={() => acceptWireSuggestion(selectedScreenContext.suggestion!)}
                      title={selectedScreenContext.suggestion.reason}
                    >
                      建议接到「{wireTargetTitle(selectedScreenContext.suggestion.target)}」 <em>一键接线</em>
                    </button>
                  ) : selectedScreenContext.deadEnd ? (
                    <span className="fc-ai-context-note">{selectedScreenContext.kind === "screen" ? "这是死路界面：还没有任何出口连线" : "还没有任何出口连线"}</span>
                  ) : (
                    <span className="fc-ai-context-note">选中即看连线状态；死路 / 分支不全时在这里给出建议</span>
                  )}
                  {selectedScreenContext.kind !== "action" ? (
                    <button
                      type="button"
                      className="fc-ai-context-fix fc-ai-context-continue"
                      onClick={() => seedAiContinue(selectedScreenContext.title, selectedScreenContext.id)}
                      title="AI 以这张卡为起点续写后续流程，插入时自动锚定在它旁边"
                    >
                      以此为起点，续写后续流程 <em>AI 续写</em>
                    </button>
                  ) : null}
                </div>
              ) : null}
              <textarea
                ref={aiTextareaRef}
                className="fc-ai-input"
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runAiPlan(aiText);
                }}
                placeholder="用「→」描述流程步骤，例如：&#10;首页 → 商品详情 → 是否已登录？→ 支付成功"
                rows={3}
              />
              <div className="fc-ai-examples">
                {AI_EXAMPLES.map((example, i) => (
                  <button key={i} type="button" className="fc-chip-btn" onClick={() => { setAiText(example); runAiPlan(example); }}>
                    示例 {i + 1}
                  </button>
                ))}
              </div>
              <div className="fc-ai-actions">
                <button type="button" className="fc-btn fc-btn-primary" onClick={() => runAiPlan(aiText)}>
                  <Icon name="sparkle" size={13} /> 生成预览
                </button>
                {aiPlan ? (
                  <button type="button" className="fc-btn fc-btn-secondary" onClick={() => insertAiPack(aiPlan)}>
                    插入到画布（{aiPlan.metrics.screens} 界面 / {aiPlan.metrics.edgeCount} 连线）
                  </button>
                ) : null}
              </div>
              {aiPlan ? (
                aiPlan.problems.length ? (
                  <p className="fc-ai-warn">{aiPlan.problems[0]}</p>
                ) : (
                  <div className="fc-ai-preview">
                    <p className="fc-ai-scenario">识别为「{aiPlan.plan.scenario}」：</p>
                    <ol className="fc-ai-steps">
                      {aiPlan.plan.steps.map((step) => (
                        <li key={step.key}>
                          {step.kind === "decision" ? "🔀" : step.kind === "action" ? "⚙️" : "📱"} {step.title}
                        </li>
                      ))}
                    </ol>
                  </div>
                )
              ) : null}
              {wireSuggestions.length ? (
                <div className="fc-ai-wires">
                  <b>智能补线（{wireSuggestions.length}）</b>
                  {wireSuggestions.map((s) => (
                    <button key={`${s.source}->${s.target}`} type="button" onClick={() => acceptWireSuggestion(s)} title={s.reason}>
                      <span>{s.reason}</span>
                      <em>采纳</em>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="fc-health-ok">当前画布没有需要补线的死路界面。</p>
              )}
            </section>
          );
        })() : null}

        {snapOpen ? (
          <section className="fc-search-panel fc-snap-panel" aria-label="快照与版本对比">
            {diffView ? (
              <>
                <div className="fc-panel-head">
                  <b>对比：「{diffView.name}」 → 当前画布</b>
                  <button type="button" className="fc-chip-btn" onClick={() => setDiffView(null)}>← 返回快照列表</button>
                </div>
                {diffView.diff.identical ? (
                  <p className="fc-health-ok">两个版本完全一致。</p>
                ) : (
                  <div className="fc-diff-list">
                    {diffView.diff.screensAdded.length ? (
                      <div className="fc-diff-sec"><b className="is-add">新增界面（{diffView.diff.screensAdded.length}）</b>{diffView.diff.screensAdded.map((t, i) => <span key={`a${i}`}>＋ {t}</span>)}</div>
                    ) : null}
                    {diffView.diff.screensRemoved.length ? (
                      <div className="fc-diff-sec"><b className="is-del">删除界面（{diffView.diff.screensRemoved.length}）</b>{diffView.diff.screensRemoved.map((t, i) => <span key={`r${i}`}>－ {t}</span>)}</div>
                    ) : null}
                    {diffView.diff.screensRenamed.length ? (
                      <div className="fc-diff-sec"><b>界面改名（{diffView.diff.screensRenamed.length}）</b>{diffView.diff.screensRenamed.map((r, i) => <span key={`n${i}`}>✎ {r.from} → {r.to}</span>)}</div>
                    ) : null}
                    {diffView.diff.edgesAdded.length ? (
                      <div className="fc-diff-sec"><b className="is-add">新增连线（{diffView.diff.edgesAdded.length}）</b>{diffView.diff.edgesAdded.map((t, i) => <span key={`ea${i}`}>＋ {t}</span>)}</div>
                    ) : null}
                    {diffView.diff.edgesRemoved.length ? (
                      <div className="fc-diff-sec"><b className="is-del">删除连线（{diffView.diff.edgesRemoved.length}）</b>{diffView.diff.edgesRemoved.map((t, i) => <span key={`er${i}`}>－ {t}</span>)}</div>
                    ) : null}
                    {diffView.diff.contentChanged.length ? (
                      <div className="fc-diff-sec"><b>内容修改（{diffView.diff.contentChanged.length}）</b>{diffView.diff.contentChanged.map((c) => <span key={c.nodeId}>✎ {c.title}：{c.changes.join("；")}</span>)}</div>
                    ) : null}
                    {diffView.diff.annotationsChanged ? <div className="fc-diff-sec"><span>✎ 批注变化 {diffView.diff.annotationsChanged} 处</span></div> : null}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="fc-panel-head">
                  <b>版本时间线</b>
                  <span>{snapshots.length} / 30</span>
                  <button type="button" className="fc-btn fc-btn-primary fc-snap-take" onClick={takeSnapshot}>📷 拍摄快照</button>
                </div>
                <div className="fc-search-results">
                  {snapshots.length ? (
                    <div className="fc-timeline">
                      {groupSnapshotsByDay(snapshots).map((group) => (
                        <div key={group.day} className="fc-tl-day">
                          <div className="fc-tl-day-label">{group.day}</div>
                          {group.items.map((s) => (
                            <div key={s.id} className="fc-tl-item">
                              <span className="fc-tl-dot" aria-hidden="true" />
                              <div className="fc-snap-meta">
                                {renamingSnapId === s.id ? (
                                  <input
                                    autoFocus
                                    defaultValue={s.name}
                                    aria-label="快照名称"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") renameSnapshotById(s.id, (e.target as HTMLInputElement).value);
                                      if (e.key === "Escape") setRenamingSnapId(null);
                                    }}
                                    onBlur={(e) => renameSnapshotById(s.id, e.target.value)}
                                  />
                                ) : (
                                  <b>
                                    {s.name}
                                    {s.auto ? <span className="fc-snap-auto">自动</span> : null}
                                  </b>
                                )}
                                <span>{new Date(s.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}</span>
                              </div>
                              <div className="fc-snap-actions">
                                <button type="button" className="fc-chip-btn" onClick={() => compareSnapshot(s)}>对比</button>
                                <button type="button" className="fc-chip-btn" onClick={() => restoreSnapshot(s)}>恢复</button>
                                <button type="button" className="fc-chip-btn" title="重命名" aria-label={`重命名 ${s.name}`} onClick={() => setRenamingSnapId(s.id)}>✎</button>
                                <button type="button" className="fc-chip-btn" onClick={() => deleteSnapshotById(s.id)}>删除</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>还没有快照。切换画布或恢复快照前会自动存一份，也可以手动拍摄并命名。</p>
                  )}
                </div>
              </>
            )}
          </section>
        ) : null}

        {importReport ? (
          <section className="fc-search-panel fc-import-panel" aria-label="导入检查结果">
            <div className="fc-panel-head">
              <b>导入检查</b>
              <span>
                {importReport.ok
                  ? `文件版本 v${importReport.declaredVersion ?? "未声明"}${importReport.migrations.length ? " · 已迁移" : " · 结构无迁移"}`
                  : "导入失败，当前画布未改动"}
              </span>
              <button type="button" className="fc-chip-btn" onClick={() => setImportReport(null)}>关闭</button>
            </div>
            {importReport.migrations.length ? (
              <div className="fc-import-migrations">
                {importReport.migrations.map((m, i) => (
                  <div key={i}>⇪ {m}</div>
                ))}
              </div>
            ) : null}
            <div className="fc-search-results">
              {importReport.issues.length ? (
                importReport.issues.map((iss) => (
                  <div key={iss.id} className={`fc-import-issue is-${iss.level}`}>
                    <b>{iss.level === "error" ? "错误" : "提示"} · {iss.path}</b>
                    <span>{iss.message}</span>
                  </div>
                ))
              ) : (
                <p className="fc-health-ok">文件结构与数据完全合法，没有需要确认的项。</p>
              )}
            </div>
          </section>
        ) : null}

        <div className="fc-main">
          <aside
            ref={palettePanel.ref}
            className={`fc-left${palettePanel.pos ? " is-floating" : ""}`}
            style={palettePanel.pos ? ({ "--panel-x": `${palettePanel.pos.x}px`, "--panel-y": `${palettePanel.pos.y}px` } as React.CSSProperties) : undefined}
          >
            <div
              className="fc-drawer-grip"
              onPointerDown={palettePanel.onDragStart}
              onDoubleClick={palettePanel.reset}
              title="拖动移动 · 双击复位"
            >
              <Icon name="grip" size={13} />
            </div>
            <div className="fc-drawer-body">
              <Palette
                onAdd={addAtCenter}
                customTemplates={customTemplates}
                onDeleteTemplate={deleteScreenTemplate}
                onImportTemplates={importTemplates}
                onExportTemplates={exportTemplates}
                onImportError={showToast}
              />
            </div>
          </aside>

          <div
            className="fc-canvas"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={onDrop}
          >
            <ReactFlow
              nodes={viewNodes}
              edges={displayEdges}
              onNodesChange={wrappedOnNodesChange}
              onEdgesChange={wrappedOnEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onlyRenderVisibleElements={cull && !renderAllForExport}
              defaultEdgeOptions={{ type: "flow", markerEnd }}
              connectionMode={ConnectionMode.Loose}
              connectionLineComponent={BezierConnectionLine}
              proOptions={{ hideAttribution: true }}
              isValidConnection={isValidConnection}
              multiSelectionKeyCode={["Meta", "Control", "Shift"]}
              /* 显式启用节点拖拽和连线：确保默认行为不被覆盖 */
              nodesDraggable
              nodesConnectable
              /* 画布手感对齐 Figma：空白处左键拖动=平移，Shift+拖动=框选，
                 滚轮=上下平移，Ctrl/⌘+滚轮=缩放，双击留给「新建界面」 */
              panOnDrag
              panOnScroll
              panOnScrollMode={PanOnScrollMode.Free}
              panOnScrollSpeed={0.7}
              zoomOnScroll
              zoomActivationKeyCode={["Meta", "Control"]}
              zoomOnDoubleClick={false}
              selectionKeyCode="Shift"
              panActivationKeyCode="Space"
              selectionMode={SelectionMode.Partial}
              deleteKeyCode={preview ? null : ["Delete", "Backspace"]}
              snapToGrid
              snapGrid={[8, 8]}
              minZoom={0.1}
              maxZoom={2.4}
              fitViewOptions={{ padding: 0.2, maxZoom: 0.9 }}
              onSelectionChange={({ nodes: sn, edges: se }) => {
                const nextNode = sn[0]?.id ?? null;
                setSelNode(nextNode);
                setSelEdge(se[0]?.id ?? null);
                // §8-5 只在集合内容变化时才更新（新数组引用会让 setState 永不 bailout，导致无限循环）
                setSelNodeIds((prev) => {
                  const next = sn.map((n) => n.id);
                  return prev.length === next.length && prev.every((id) => next.includes(id)) ? prev : next;
                });
                if (nextNode) setInspectorOpen(true);
              }}
              /* 拖动节点前先存一份快照：否则 Ctrl+Z 回不去，用户会觉得撤销坏了 */
              onNodeDragStart={() => snapshot()}
              onDoubleClick={(e) => {
                if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return;
                snapshot();
                const node = createNode({ kind: "screen", template: "home" }, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
                setNodes((ns) => ns.concat(node));
                setSelNode(node.id);
              }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--fc-grid-dot)" />
              <MiniMap
                pannable
                zoomable
                className="fc-minimap"
                nodeColor={(n) => (n.type === "screen" ? "var(--fc-minimap-screen)" : n.type === "decision" ? "var(--fc-minimap-decision)" : "var(--fc-minimap-action)")}
                maskColor="var(--fc-minimap-mask)"
              />
              <Controls className="fc-controls" showInteractive={false} />
            </ReactFlow>

            {nodes.length === 0 ? (
              <div className="fc-empty">
                <div className="fc-empty-card">
                  <h3>还没有界面，从左边拖一个上来</h3>
                  <p>
                    拖「登录页」到画布 → 选中它 → 把界面里的按钮/卡片拖到另一个界面上，就得到一条带标签的跳转连线。
                    <br />
                    按 P 还能像真机一样点着走完整个流程。
                  </p>
                  <button className="fc-btn fc-btn-primary" onClick={resetSample}>
                    载入示例流程
                  </button>
                </div>
              </div>
            ) : null}

            {bench && benchMode ? (
              <div className="fc-hint" style={{ top: 12, bottom: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                <strong>性能基线 {benchMode}</strong>
                <span>
                  {bench.nodes.length} 节点 / {bench.edges.length} 边
                </span>
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={cull} onChange={(e) => setCull(e.target.checked)} />
                  可视区裁剪
                </label>
              </div>
            ) : null}

            <div className="fc-hint">
              <Icon name="compass" size={13} /> 拖动平移 · Ctrl/⌘ 滚轮缩放 · Shift 框选 · P 预览
            </div>

            {/* 常驻 AI 输入条：bench 性能测量下隐藏 */}
            {!bench ? (
              aiBarOpen ? (
                <div className="fc-ai-bar">
                  {aiPlan && !aiOpen ? (
                    aiPlan.problems.length ? (
                      <div className="fc-ai-bar-result is-warn">{aiPlan.problems[0]}</div>
                    ) : (
                      <div className="fc-ai-bar-result">
                        <span className="fc-ai-bar-result-text">
                          识别为「{aiPlan.plan.scenario}」 · {aiPlan.metrics.screens} 界面 / {aiPlan.metrics.edgeCount} 连线
                        </span>
                        <button type="button" className="fc-btn fc-btn-primary fc-ai-bar-insert" onClick={insertFromAiBar}>
                          <Icon name="sparkle" size={12} /> 插入{selNode && (() => { const sn = nodes.find((n) => n.id === selNode); const sd = sn?.data as unknown as ScreenData | undefined; return sn && (sn.type === "screen" || sn.type === "decision") && sd?.title ? `到「${sd.title}」旁` : ""; })()}
                        </button>
                        <button type="button" className="fc-chip-btn" onClick={expandAiPanelFromBar} title="在 AI 面板中查看步骤详情与补线建议">
                          展开面板
                        </button>
                      </div>
                    )
                  ) : null}
                  <div className="fc-ai-bar-inputrow">
                    <span className="fc-ai-bar-spark" aria-hidden="true"><Icon name="sparkle" size={12} /></span>
                    <input
                      ref={aiBarInputRef}
                      className="fc-ai-bar-input"
                      value={aiText}
                      onChange={(e) => setAiText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          runAiBar(aiText);
                        } else if (e.key === "Escape") {
                          setAiBarOpen(false);
                        }
                      }}
                      placeholder="用「→」描述流程，Enter 生成：首页 → 登录 → 支付成功"
                      aria-label="AI 流程输入"
                    />
                    <button type="button" className="fc-chip-btn" onClick={() => setAiBarOpen(false)} title="收起（Esc）">
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="fc-ai-bar fc-ai-bar-collapsed" onClick={() => { setAiBarOpen(true); requestAnimationFrame(() => aiBarInputRef.current?.focus()); }} title="AI 帮我画流程（Ctrl/⌘+K）">
                  <span className="fc-ai-bar-spark" aria-hidden="true"><Icon name="sparkle" size={12} /></span>
                  AI 帮我画流程
                  <kbd>Ctrl K</kbd>
                </button>
              )
            ) : null}

            {restored ? <div className="fc-restored">已恢复上次编辑的流程</div> : null}

            {/* §8-5 多选对齐/分布工具条：≥2 选中浮现，bench 下隐藏 */}
            {!bench && selNodeIds.length >= 2 ? (
              <div className="fc-align-bar" role="toolbar" aria-label="对齐与分布">
                {(
                  [
                    ["left", "左对齐", "M2 1v14 M5 4h9v2H5z M5 10h6v2H5z"],
                    ["hcenter", "水平居中", "M8 1v14 M4 4h8v2H4z M5 10h6v2H5z"],
                    ["right", "右对齐", "M14 1v14 M2 4h9v2H2z M5 10h6v2H5z"],
                    ["hdist", "水平等距分布", "M2 1v14 M14 1v14 M6.5 6h3v4h-3z"],
                    ["top", "顶对齐", "M1 2h14 M4 5h2v9H4z M10 5h2v6h-2z"],
                    ["vcenter", "垂直居中", "M1 8h14 M4 4h2v8H4z M10 5h2v6h-2z"],
                    ["bottom", "底对齐", "M1 14h14 M4 2h2v9H4z M10 5h2v6h-2z"],
                    ["vdist", "垂直等距分布", "M1 2h14 M1 14h14 M6 6.5h4v3H6z"],
                  ] as [AlignAction, string, string][]
                ).map(([action, label, path]) => {
                  const disabled = (action === "hdist" || action === "vdist") && selNodeIds.length < 3;
                  return (
                    <button
                      key={action}
                      type="button"
                      className="fc-align-btn"
                      disabled={disabled}
                      title={disabled ? `${label}（需 ≥3 个选中）` : label}
                      aria-label={label}
                      onClick={() => applyAlignActionToSelection(action)}
                    >
                      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <aside
            ref={inspectorPanel.ref}
            className={`fc-right${inspectorOpen ? " is-open" : ""}${inspectorPanel.pos ? " is-floating" : ""}`}
            id="fc-inspector-panel"
            style={inspectorPanel.pos ? ({ "--panel-x": `${inspectorPanel.pos.x}px`, "--panel-y": `${inspectorPanel.pos.y}px` } as React.CSSProperties) : undefined}
          >
            <div
              className="fc-drawer-grip"
              onPointerDown={inspectorPanel.onDragStart}
              onDoubleClick={inspectorPanel.reset}
              title="拖动移动 · 双击复位"
            >
              <Icon name="grip" size={13} />
            </div>
            <div className="fc-drawer-body">
              <Inspector
              node={selectedNode}
              edge={selectedEdge}
              nodes={nodes}
              onPatchNodeData={patchNodeData}
              onPatchScreen={patchScreen}
              onPatchElement={patchElement}
              onAddElement={addElement}
              onRemoveElement={removeElement}
              onReorderElement={reorderElement}
              onPatchEdge={patchEdge}
              onCreateLink={createLink}
              onResetLayout={resetScreenLayout}
              onSaveTemplate={saveScreenTemplate}
              onDeleteEdge={deleteEdge}
              onDeleteNode={deleteNode}
              annotations={annotations}
              onAddAnnotation={addAnnotation}
              onUpdateAnnotation={patchAnnotation}
              onDeleteAnnotation={removeAnnotation}
              />
            </div>
          </aside>
        </div>

        {inspectorOpen ? (
          <>
            <div className="fc-inspector-drawer-mask" onClick={() => setInspectorOpen(false)} />
            <button type="button" className="fc-drawer-close fc-inspector-close" onClick={() => setInspectorOpen(false)} aria-label="关闭属性面板">
              <Icon name="x" size={16} />
            </button>
          </>
        ) : null}

        {paletteOpen ? (
          <>
            <div className="fc-drawer-mask" onClick={() => setPaletteOpen(false)} />
            <aside className="fc-left fc-left-drawer" id="fc-palette-drawer">
              <Palette
                onAdd={(payload) => {
                  addAtCenter(payload);
                  setPaletteOpen(false);
                }}
                customTemplates={customTemplates}
                onDeleteTemplate={deleteScreenTemplate}
                onImportTemplates={importTemplates}
                onExportTemplates={exportTemplates}
                onImportError={showToast}
              />
            </aside>
          </>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = "";
          }}
        />

        {menuOpen ? <div className="fc-menu-mask" onClick={() => setMenuOpen(false)} /> : null}
        {canvasMenuOpen ? <div className="fc-menu-mask" onClick={() => setCanvasMenuOpen(false)} /> : null}
        {canvasMenuOpen && canvasMenuPosition
          ? createPortal(
              <div className="fc-menu-panel fc-canvas-panel" role="menu" style={{ left: canvasMenuPosition.left, top: canvasMenuPosition.top, minWidth: Math.max(280, canvasMenuPosition.width) }}>
                {canvases.map((c) => (
                  <div key={c.id} className={`fc-canvas-row${c.id === activeCanvasId ? " is-active" : ""}`}>
                    {renamingCanvasId === c.id ? (
                      <input
                        autoFocus
                        defaultValue={c.name}
                        aria-label="画布名称"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameCanvas(c.id, (e.target as HTMLInputElement).value);
                          if (e.key === "Escape") setRenamingCanvasId(null);
                        }}
                        onBlur={(e) => renameCanvas(c.id, e.target.value)}
                      />
                    ) : (
                      <button type="button" className="fc-canvas-open" role="menuitem" onClick={() => switchCanvas(c.id)}>
                        <b>{c.name}</b>
                        {c.id === activeCanvasId ? <span className="fc-canvas-current">当前</span> : null}
                      </button>
                    )}
                    <span className="fc-canvas-actions">
                      <button type="button" title="重命名" aria-label={`重命名 ${c.name}`} onClick={() => setRenamingCanvasId(c.id)}>✎</button>
                      <button type="button" title="复制画布" aria-label={`复制 ${c.name}`} onClick={() => duplicateCanvas(c.id)}>⧉</button>
                      {confirmDeleteCanvasId === c.id ? (
                        <button type="button" className="fc-canvas-del-armed" title="再次点击确认删除" onClick={() => deleteCanvas(c.id)}>确认删除</button>
                      ) : (
                        <button type="button" title="删除画布" aria-label={`删除 ${c.name}`} disabled={canvases.length <= 1} onClick={() => setConfirmDeleteCanvasId(c.id)}>🗑</button>
                      )}
                    </span>
                  </div>
                ))}
                <button type="button" role="menuitem" className="fc-canvas-new" onClick={createCanvas}>＋ 新建画布</button>
              </div>,
              document.body,
            )
          : null}
        {toast ? <div className="fc-toast">{toast}</div> : null}

        {preview ? <Preview nodes={nodes} edges={edges} startId={previewStart} onExit={() => setPreview(false)} /> : null}
      </div>
    </EditorContext.Provider>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const exampleMode = params.get("example") === "ecommerce";
  const benchMode = parseBenchLevel(params.get("bench"));
  return (
    <ReactFlowProvider>
      <CanvasApp exampleMode={exampleMode} benchMode={benchMode} />
    </ReactFlowProvider>
  );
}

