import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { filterTemplates, getTemplateCategories, templateCategory, type TemplateCategory } from "./templateMarket";
import { screenTemplates } from "./sample";
import type { ScreenTemplate } from "./types";

export type PaletteDragPayload =
  | { kind: "screen"; template: string }
  | { kind: "decision" }
  | { kind: "action" }
  | { kind: "note" };

type Props = {
  onAdd: (payload: PaletteDragPayload) => void;
  customTemplates?: ScreenTemplate[];
  onDeleteTemplate?: (id: string) => void;
  onImportTemplates?: (file: File) => void | Promise<void>;
  onExportTemplates?: () => void;
  onImportError?: (message: string) => void;
};

const CATEGORY_ALL = "全部" as const;
type PaletteTab = "templates" | "nodes";

type MarketTemplate = {
  key: string;
  template: ScreenTemplate;
  customIndex: number | null;
};

type FlowNodeDefinition = {
  kind: "decision" | "action" | "note";
  icon: string;
  title: string;
  description: string;
  hint: string;
};

const TEMPLATE_ICON_BY_KEY: Record<string, string> = {
  login: "phone",
  home: "grid",
  detail: "image",
  settings: "user",
  pay: "card",
  success: "check",
};

const FLOW_NODES: FlowNodeDefinition[] = [
  {
    kind: "decision",
    icon: "diamond",
    title: "判断 / 条件",
    description: "是 / 否 两条分支",
    hint: "用于拆分流程走向",
  },
  {
    kind: "action",
    icon: "bolt",
    title: "系统动作",
    description: "接口 / 回调 / Toast",
    hint: "标记后台或系统行为",
  },
  {
    kind: "note",
    icon: "note",
    title: "备注",
    description: "交互说明 / 约束",
    hint: "补充设计上下文",
  },
];

const PALETTE_STYLES = `
.fc-palette-refined {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.fc-palette-refined .fc-palette-heading {
  align-items: flex-start;
  margin-bottom: 10px;
}
.fc-palette-refined .fc-palette-heading-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.fc-palette-refined .fc-palette-eyebrow {
  color: var(--fc-muted);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1.2;
  text-transform: uppercase;
}
.fc-palette-refined .fc-palette-heading .fc-panel-title {
  margin: 0;
  color: var(--fc-text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: none;
}
.fc-palette-refined .fc-palette-count {
  min-width: 24px;
  height: 20px;
  margin-top: 2px;
  border-radius: 6px;
  font-size: 10px;
}
.fc-palette-refined .fc-palette-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  margin: 0 0 11px;
  padding: 3px;
  background: var(--fc-surface-subtle);
  border: 1px solid var(--fc-border);
  border-radius: 10px;
}
.fc-palette-refined .fc-palette-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 34px;
  padding: 0 8px;
  color: var(--fc-muted);
  background: transparent;
  border: 0;
  border-radius: 7px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease;
}
.fc-palette-refined .fc-palette-tab:hover {
  color: var(--fc-text);
  background: var(--fc-surface-hover);
}
.fc-palette-refined .fc-palette-tab[aria-selected="true"] {
  color: var(--fc-accent);
  background: var(--fc-surface-card);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--fc-accent) 30%, transparent);
}
.fc-palette-refined .fc-palette-tab:focus-visible,
.fc-palette-refined .fc-palette-action:focus-visible,
.fc-palette-refined .fc-palette-clear:focus-visible,
.fc-palette-refined .fc-palette-item:focus-visible,
.fc-palette-refined .fc-palette-row:focus-visible,
.fc-palette-refined .fc-icon-btn:focus-visible,
.fc-palette-refined .fc-palette-search:focus-within,
.fc-palette-refined .fc-palette-filter select:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--fc-accent) 82%, transparent);
  outline-offset: 2px;
}
.fc-palette-refined .fc-palette-tools {
  gap: 8px;
  margin-bottom: 9px;
}
.fc-palette-refined .fc-palette-search {
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--fc-surface-subtle);
}
.fc-palette-refined .fc-palette-search > svg {
  flex: 0 0 auto;
  color: var(--fc-muted);
}
.fc-palette-refined .fc-palette-search input {
  font-size: 11.5px;
}
.fc-palette-refined .fc-palette-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.fc-palette-refined .fc-palette-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
}
.fc-palette-refined .fc-palette-filter {
  align-items: center;
  gap: 8px;
  margin-bottom: 13px;
}
.fc-palette-refined .fc-palette-filter-label {
  flex: 0 0 auto;
  color: var(--fc-muted);
  font-size: 10.5px;
}
.fc-palette-refined .fc-palette-filter select {
  height: 32px;
  border-radius: 8px;
  font-size: 11px;
}
.fc-palette-refined .fc-palette-clear {
  height: 30px;
  border-radius: 8px;
  font-size: 10.5px;
}
.fc-palette-refined .fc-palette-section {
  margin: 0 0 15px;
}
.fc-palette-refined .fc-palette-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 7px;
}
.fc-palette-refined .fc-palette-section-heading .fc-palette-section-title {
  margin: 0;
}
.fc-palette-refined .fc-palette-section-count {
  color: var(--fc-muted);
  font-size: 10px;
}
.fc-palette-refined .fc-palette-grid {
  gap: 8px;
  margin-bottom: 0;
}
.fc-palette-refined .fc-palette-template-card {
  min-height: 70px;
  gap: 7px;
  padding: 10px;
  border-radius: 9px;
  background: var(--fc-surface-card);
  text-align: left;
}
.fc-palette-refined .fc-palette-template-card:hover {
  border-color: color-mix(in oklab, var(--fc-accent) 55%, var(--fc-border));
  background: color-mix(in oklab, var(--fc-accent) 8%, var(--fc-surface-hover));
}
.fc-palette-refined .fc-palette-template-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  color: var(--fc-accent);
  background: color-mix(in oklab, var(--fc-accent) 13%, transparent);
  border: 1px solid color-mix(in oklab, var(--fc-accent) 18%, var(--fc-border));
  border-radius: 8px;
  font-size: 0;
}
.fc-palette-refined .fc-palette-template-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  min-width: 0;
}
.fc-palette-refined .fc-palette-template-copy strong {
  overflow: hidden;
  color: var(--fc-text);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fc-palette-refined .fc-palette-template-card .fc-palette-category {
  position: static;
  width: fit-content;
  margin: 0;
  padding: 0;
  color: var(--fc-muted);
  background: transparent;
  border: 0;
  border-radius: 0;
  font-size: 10px;
  line-height: 1.4;
}
.fc-palette-refined .fc-palette-custom {
  gap: 7px;
  margin-bottom: 0;
}
.fc-palette-refined .fc-palette-custom-row {
  gap: 7px;
}
.fc-palette-refined .fc-palette-custom-row .fc-palette-template-card {
  flex-direction: row;
  align-items: center;
  min-height: 52px;
}
.fc-palette-refined .fc-palette-custom-row .fc-palette-template-copy {
  width: auto;
}
.fc-palette-refined .fc-palette-custom-row .fc-icon-btn {
  flex: 0 0 32px;
  min-height: 52px;
  height: auto;
  border-radius: 8px;
}
.fc-palette-refined .fc-palette-empty {
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 15px;
  padding: 14px 12px;
  border-radius: 9px;
}
.fc-palette-refined .fc-palette-empty > svg {
  color: var(--fc-muted);
}
.fc-palette-refined .fc-palette-node-intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 10px;
  padding: 11px 12px;
  background: color-mix(in oklab, var(--fc-accent) 7%, var(--fc-surface-subtle));
  border: 1px solid color-mix(in oklab, var(--fc-accent) 18%, var(--fc-border));
  border-radius: 9px;
}
.fc-palette-refined .fc-palette-node-intro strong {
  color: var(--fc-text);
  font-size: 12px;
  font-weight: 600;
}
.fc-palette-refined .fc-palette-node-intro span {
  color: var(--fc-muted);
  font-size: 10.5px;
  line-height: 1.55;
}
.fc-palette-refined .fc-palette-list {
  gap: 8px;
}
.fc-palette-refined .fc-palette-node-card {
  width: 100%;
  min-height: 58px;
  gap: 10px;
  padding: 10px;
  border-radius: 9px;
  text-align: left;
}
.fc-palette-refined .fc-palette-node-card:hover {
  background: color-mix(in oklab, var(--fc-accent) 8%, var(--fc-surface-hover));
}
.fc-palette-refined .fc-palette-node-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 8px;
  font-size: 0;
}
.fc-palette-refined .fc-palette-node-icon.is-decision {
  color: #7c3aed;
  background: rgba(139, 92, 246, 0.14);
}
.fc-palette-refined .fc-palette-node-icon.is-action {
  color: #0e7490;
  background: rgba(34, 211, 238, 0.12);
}
.fc-palette-refined .fc-palette-node-icon.is-note {
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}
.fc-palette-refined .fc-palette-node-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.fc-palette-refined .fc-palette-node-copy b {
  color: var(--fc-text);
  font-size: 12.5px;
  font-weight: 600;
}
.fc-palette-refined .fc-palette-node-copy em {
  overflow: hidden;
  color: var(--fc-muted);
  font-size: 10.5px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fc-palette-refined .fc-palette-node-hint {
  margin-left: auto;
  color: var(--fc-muted);
  font-size: 9.5px;
  white-space: nowrap;
}
.fc-palette-refined .fc-palette-tip {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 14px;
  padding-top: 11px;
  font-size: 10.5px;
  line-height: 1.55;
}
.fc-palette-refined .fc-palette-tip > svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--fc-muted);
}
@media (max-width: 940px) {
  .fc-palette-refined .fc-palette-tab,
  .fc-palette-refined .fc-palette-search,
  .fc-palette-refined .fc-palette-action,
  .fc-palette-refined .fc-palette-filter select {
    min-height: 40px;
  }
  .fc-palette-refined .fc-palette-template-card {
    min-height: 74px;
  }
}
`;

export function Palette({
  onAdd,
  customTemplates = [],
  onDeleteTemplate,
  onImportTemplates,
  onExportTemplates,
  onImportError,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const categoryId = useId();
  const tabsId = useId();
  const tabRefs = useRef<Record<PaletteTab, HTMLButtonElement | null>>({ templates: null, nodes: null });
  const [activeTab, setActiveTab] = useState<PaletteTab>("templates");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TemplateCategory | typeof CATEGORY_ALL>(CATEGORY_ALL);
  const deferredQuery = useDeferredValue(query);

  const marketTemplates = useMemo<MarketTemplate[]>(() => {
    const builtIns = Object.entries(screenTemplates).map(([key, template]) => ({
      key,
      template,
      customIndex: null,
    }));
    const custom = customTemplates.map((template, index) => ({
      key: template.id ?? `custom-${index}`,
      template,
      customIndex: index,
    }));
    return [...builtIns, ...custom];
  }, [customTemplates]);

  const availableCategories = useMemo(
    () => getTemplateCategories(marketTemplates.map((entry) => entry.template)),
    [marketTemplates],
  );
  const visibleTemplates = useMemo(
    () => filterTemplates(
      marketTemplates.map((entry) => entry.template),
      deferredQuery,
      category === CATEGORY_ALL ? undefined : category,
    ),
    [marketTemplates, deferredQuery, category],
  );
  const visibleSet = useMemo(() => new Set(visibleTemplates), [visibleTemplates]);
  const visibleEntries = marketTemplates.filter((entry) => visibleSet.has(entry.template));
  const builtInEntries = visibleEntries.filter((entry) => entry.customIndex === null);
  const customEntries = visibleEntries.filter((entry) => entry.customIndex !== null);
  const hasFilters = query.trim().length > 0 || category !== CATEGORY_ALL;

  const startDrag = (event: DragEvent<HTMLElement>, payload: PaletteDragPayload) => {
    event.dataTransfer.setData("application/flowcraft", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  };

  const startImport = () => {
    if (!onImportTemplates) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (file: File | undefined) => {
    if (!file || !onImportTemplates) return;
    try {
      onImportTemplates(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "模板导入失败，请检查文件格式";
      onImportError?.(message);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setCategory(CATEGORY_ALL);
  };

  const activateTab = (tab: PaletteTab, focus = false) => {
    setActiveTab(tab);
    if (focus) {
      requestAnimationFrame(() => tabRefs.current[tab]?.focus());
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: PaletteTab) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const nextTab: PaletteTab = event.key === "Home"
      ? "templates"
      : event.key === "End"
        ? "nodes"
        : tab === "templates"
          ? "nodes"
          : "templates";
    activateTab(nextTab, true);
  };

  const templateIconName = (entry: MarketTemplate) => {
    if (entry.customIndex !== null) return "layers";
    return TEMPLATE_ICON_BY_KEY[entry.key] ?? "layers";
  };

  const renderTemplateButton = (entry: MarketTemplate) => {
    const { template } = entry;
    const templateKey = entry.customIndex === null ? entry.key : template.id ?? `custom-${entry.customIndex}`;
    const categoryName = templateCategory(template);
    return (
      <button
        key={entry.key}
        type="button"
        className="fc-palette-item fc-palette-template-card"
        draggable
        onDragStart={(event) => startDrag(event, { kind: "screen", template: templateKey })}
        onClick={() => onAdd({ kind: "screen", template: templateKey })}
        title={`拖到画布或点击添加：${template.name}，${categoryName}`}
        aria-label={`添加模板：${template.name}，${categoryName}`}
      >
        <span className="fc-palette-icon fc-palette-template-icon" aria-hidden="true">
          <Icon name={templateIconName(entry)} size={17} />
        </span>
        <span className="fc-palette-template-copy">
          <strong>{template.name}</strong>
          <span className="fc-palette-category">{categoryName}</span>
        </span>
      </button>
    );
  };

  const renderFlowNodeButton = (node: FlowNodeDefinition) => (
    <button
      key={node.kind}
      type="button"
      className="fc-palette-row fc-palette-node-card"
      draggable
      onDragStart={(event) => startDrag(event, { kind: node.kind })}
      onClick={() => onAdd({ kind: node.kind })}
      title={`拖到画布或点击添加：${node.title}`}
      aria-label={`添加流程节点：${node.title}，${node.hint}`}
    >
      <span className={`fc-palette-icon fc-palette-node-icon is-${node.kind}`} aria-hidden="true">
        <Icon name={node.icon} size={19} />
      </span>
      <span className="fc-palette-node-copy">
        <b>{node.title}</b>
        <em>{node.description}</em>
      </span>
      <span className="fc-palette-node-hint">添加</span>
    </button>
  );

  return (
    <div className="fc-palette fc-palette-refined">
      <style>{PALETTE_STYLES}</style>
      <div className="fc-palette-heading">
        <div className="fc-palette-heading-copy">
          <div className="fc-palette-eyebrow">本地模板库</div>
          <div className="fc-panel-title">画布资源</div>
        </div>
        <span className="fc-palette-count" aria-label={activeTab === "templates" ? "模板总数" : "流程节点总数"}>
          {activeTab === "templates" ? marketTemplates.length : FLOW_NODES.length}
        </span>
      </div>

      <div className="fc-palette-tabs" role="tablist" aria-label="画布资源类型">
        <button
          ref={(node) => { tabRefs.current.templates = node; }}
          id={`${tabsId}-templates-tab`}
          type="button"
          role="tab"
          className="fc-palette-tab"
          aria-selected={activeTab === "templates"}
          aria-controls={`${tabsId}-templates-panel`}
          tabIndex={activeTab === "templates" ? 0 : -1}
          onClick={() => activateTab("templates")}
          onKeyDown={(event) => handleTabKeyDown(event, "templates")}
        >
          <Icon name="grid" size={15} />
          模板
        </button>
        <button
          ref={(node) => { tabRefs.current.nodes = node; }}
          id={`${tabsId}-nodes-tab`}
          type="button"
          role="tab"
          className="fc-palette-tab"
          aria-selected={activeTab === "nodes"}
          aria-controls={`${tabsId}-nodes-panel`}
          tabIndex={activeTab === "nodes" ? 0 : -1}
          onClick={() => activateTab("nodes")}
          onKeyDown={(event) => handleTabKeyDown(event, "nodes")}
        >
          <Icon name="layers" size={15} />
          流程节点
        </button>
      </div>

      {activeTab === "templates" ? (
        <section
          id={`${tabsId}-templates-panel`}
          className="fc-palette-tab-panel"
          role="tabpanel"
          aria-labelledby={`${tabsId}-templates-tab`}
        >
          <div className="fc-palette-tools">
            <label className="fc-palette-search" htmlFor={searchId}>
              <Icon name="search" size={15} />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索模板或内容"
                aria-label="搜索模板"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="fc-palette-actions">
              <button
                type="button"
                className="fc-palette-action"
                onClick={startImport}
                disabled={!onImportTemplates}
                title={onImportTemplates ? "导入模板 JSON" : "当前环境未接入模板导入"}
              >
                <Icon name="upload" size={14} />
                导入
              </button>
              <button
                type="button"
                className="fc-palette-action"
                onClick={onExportTemplates}
                disabled={!onExportTemplates}
                title={onExportTemplates ? "导出全部模板 JSON" : "当前环境未接入模板导出"}
              >
                <Icon name="download" size={14} />
                导出
              </button>
            </div>
            <input
              ref={fileInputRef}
              className="fc-visually-hidden"
              type="file"
              accept="application/json,.json"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                handleFileChange(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          <div className="fc-palette-filter">
            <span className="fc-palette-filter-label">分类</span>
            <select
              id={categoryId}
              value={category}
              aria-label="模板分类"
              onChange={(event) => setCategory(event.target.value as TemplateCategory | typeof CATEGORY_ALL)}
            >
              <option value={CATEGORY_ALL}>全部分类</option>
              {availableCategories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            {hasFilters ? (
              <button type="button" className="fc-palette-clear" onClick={clearFilters}>
                清除
              </button>
            ) : null}
          </div>

          {builtInEntries.length ? (
            <section className="fc-palette-section" aria-label="内置模板">
              <div className="fc-palette-section-heading">
                <div className="fc-panel-title fc-palette-section-title">内置模板</div>
                <span className="fc-palette-section-count">{builtInEntries.length}</span>
              </div>
              <div className="fc-palette-grid">
                {builtInEntries.map(renderTemplateButton)}
              </div>
            </section>
          ) : null}

          {customEntries.length ? (
            <section className="fc-palette-section" aria-label="我的模板">
              <div className="fc-palette-section-heading">
                <div className="fc-panel-title fc-palette-section-title">我的模板</div>
                <span className="fc-palette-section-count">{customEntries.length}</span>
              </div>
              <div className="fc-palette-custom">
                {customEntries.map((entry) => (
                  <div key={entry.key} className="fc-palette-custom-row">
                    {renderTemplateButton(entry)}
                    {onDeleteTemplate ? (
                      <button
                        type="button"
                        className="fc-icon-btn"
                        onClick={() => onDeleteTemplate(entry.template.id ?? `custom-${entry.customIndex}`)}
                        aria-label={`删除模板 ${entry.template.name}`}
                        title="删除这个自定义模板"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!visibleEntries.length ? (
            <div className="fc-palette-empty" role="status">
              <Icon name="search" size={16} />
              <strong>没有匹配的模板</strong>
              <span>试试搜索「登录」或切换到全部分类。</span>
              <button type="button" className="fc-palette-clear" onClick={clearFilters}>清除筛选</button>
            </div>
          ) : null}
        </section>
      ) : (
        <section
          id={`${tabsId}-nodes-panel`}
          className="fc-palette-tab-panel"
          role="tabpanel"
          aria-labelledby={`${tabsId}-nodes-tab`}
        >
          <div className="fc-palette-node-intro">
            <strong>补充流程语义</strong>
            <span>把判断、动作或说明拖到画布，也可以直接点击添加。</span>
          </div>
          <div className="fc-palette-list">
            {FLOW_NODES.map(renderFlowNodeButton)}
          </div>
          <div className="fc-palette-tip">
            <Icon name="link" size={14} />
            <span>拖到画布，或点击添加。节点拖入后可继续编辑内容。</span>
          </div>
        </section>
      )}
    </div>
  );
}