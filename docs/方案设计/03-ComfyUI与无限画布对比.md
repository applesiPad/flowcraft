# 04 · ComfyUI 与「无限画布（infinite-canvas）」全方面对比

> 对比对象：**无限画布（infinite-canvas）**（原 clone 于工作区 `repo/`，2026-11-03 已删除，源码见 `github.com/basketikun/infinite-canvas`）——面向图片/AI 内容创作的节点式工作台（Vite + React + antd + Tailwind + Zustand，浏览器前端直连 OpenAI 兼容接口）。
> 调研方式：用户提供知乎教程（`https://zhuanlan.zhihu.com/p/2053788828905763748`）+ ego 浏览器访问 ComfyUI 官方仓库 `Comfy-Org/ComfyUI`、前端仓库 `Comfy-Org/ComfyUI_frontend`、官方文档 `docs.comfy.org`。
> 核实时间：2026-10-31（Asia/Shanghai）。

## 0. 证据分级

| 标记 | 含义 | 读者该怎么用 |
| --- | --- | --- |
| 【核实】 | 有一手来源：URL / 官方 README / 本仓库 `file:line` / ego 浏览器抓到的原文 | 可直接引用 |
| 【实测】 | 在本机或 ego 浏览器里真跑过（导航、抽取正文） | 可信，受本机网络环境限制 |
| 【推断】 | 基于代码阅读与同类产品常识，无一字来源 | 落地前必须 PoC |

## 1. 三条结论先行

1. **同一范式、同一赛道，但"计算在哪"和"节点语义粒度"完全不同**。两者都是节点图 + 连线 + AI 内容生成的「乐高式」工具；但 ComfyUI 是**本地 GPU 推理引擎 + 图执行引擎 + 生态平台**（Python 后端、模型落地本机、连线承载类型化张量），无限画布是**浏览器端 API 编排工作台**（无后端、连线只表达"上游有哪些素材"、真正的计算是云端 API 一次性完成）。
2. **ComfyUI 的护城河在"执行引擎"与"生态"**：局部重执行/缓存、模型卸载/异步权重流、类型化端口（MODEL/CLIP/VAE/LATENT…）、Python 自定义节点 3000+、工作流随 PNG 元数据自携带。这些是**深度技术壁垒**，短期无法复制。
3. **无限画布的护城河在"零门槛 + 编排层"**：浏览器即开即用、无需装 Python/GPU/模型、直连任意 OpenAI 兼容接口（含 Gemini、中转站）、TypeScript 插件 SDK、本地 Agent(MCP)、提示词库。它的机会不是"复刻 ComfyUI 的执行引擎"，而是**用更低的门槛服务"云 API 用户"**，并借鉴 ComfyUI 的节点/工作流设计经验（详见 §6）。

## 2. 定位与产品形态

| 维度 | ComfyUI | 无限画布（infinite-canvas） |
| --- | --- | --- |
| 一句话定位 | 本地/云端的模块化扩散模型 GUI + API + 后端，图形节点界面【核实：官方 README 标题】 | 面向图片创作的开源工作台，画布编排 + AI 生图 + 参考图编辑 + 对话助手【核实：`repo/README.md:25`】 |
| 目标用户 | 视觉专业用户、追求模型/参数/输出全可控、可脚本化、可接生产管线 | 用 API 生图的普通创作者/设计师，不想折腾本地环境 |
| 运行形态 | 本地 Python 服务（`python main.py`，默认 `http://127.0.0.1:8188`）+ 桌面客户端 + 官方云【核实】 | 纯浏览器 SPA（`bun run dev` 或 Docker，默认端口 3000）【核实：`repo/README.md`】 |
| 是否需要 GPU/模型 | 是（本地推理）；4GB 显存起步，可 CPU/Apple MPS【核实：README + 知乎 §3】 | 否（计算在云端 API，浏览器只发请求） |
| 许可 | 核心与前端 GPL-3.0（前端 `package.json` 实核 `GPL-3.0-only`） | MIT【核实：`repo/README.md:198`】 |
| 社区规模 | GitHub 11.4 万+ stars、3000+ 自定义节点【核实：知乎 §1.2】 | 9,433 stars（截至 2026-10-25）【核实：`docs/01` 引用 GitHub API】 |

## 3. 功能全量对比表

评分口径：✅ 原生支持且成熟；🟡 支持但受限/需自行补齐；❌ 不支持。

| 能力 | ComfyUI | 无限画布 | 备注 |
| --- | --- | --- | --- |
| 节点图（拖拽/缩放/平移/框选/多选/复制粘贴） | ✅ | ✅ | 二者手势基本对齐（空格平移、滚轮缩放、框选、Delete 删除）【核实：ComfyUI README 快捷键表；`docs/02` 手势表】 |
| 节点连线 | ✅ 类型化端口，颜色区分类型 | 🟡 单源单目标，无类型无标签 | 见 §4.4 |
| 连线合法性校验 | ✅ 类型不匹配不能连 | ✅ 仅"结构合法"（禁自环/禁热点对热点）【核实：`docs/02` §7.3-2】 | |
| 文生图 | ✅ SD/SDXL/SD3.5/Flux/Qwen…【核实：README】 | ✅ OpenAI 兼容 + Gemini【核实：`features.mdx`】 | |
| 图生图 / 参考图编辑 | ✅ img2img + ControlNet + 重绘/外扩/蒙版合成 | ✅ 参考图编辑（多图参考）【核实：`image.ts` `requestEdit`】 | |
| 视频生成 | ✅ Wan/LTX/HunyuanVideo/CogVideoX…【核实】 | ✅ OpenAI 风格视频接口【核实：`features.mdx`】 | |
| 音频生成 | ✅ Stable Audio/ACE-Step…【核实】 | ✅ 音频生成节点【核实：`features.mdx`】 | |
| 3D 生成 | ✅ Hunyuan3D/TripoSplat…【核实】 | ❌ | |
| 文本生成（LLM） | ✅ Gemma/Qwen3 等多模态【核实】 | ✅ 文本问答节点【核实：`features.mdx`】 | |
| 局部重绘 / 遮罩 / 抠图 | ✅ 内置 inpainting/outpainting/mask/composite/分割(RMBG/SAM/DINO)【核实】 | 🟡 有蒙版编辑弹窗【核实：`canvas-node-mask-edit-dialog.tsx`】，无 GroundingDINO/SAM 级自动分割 | |
| 放大 / 超分 | ✅ 内置 Upscale Model（ESRGAN 等）【核实】 | 🟡 有 upscale 弹窗，能力依赖所接 API 模型 | |
| 模型合并 | ✅ 内置【核实：README "model merging"】 | ❌ | |
| 帧插值 / 深度估计 / 分割 | ✅ 内置【核实】 | ❌ | |
| 子图 / 分组 / 复用 | ✅ Reusable subgraphs、Group、模板【核实：README】 | 🟡 有 Group 节点类型【核实：`canvas.ts` `CanvasNodeType.Group`】，无"子图即工作流复用" | |
| App Mode（把复杂流封装成简单 UI） | ✅【核实：README】 | ❌ | |
| 工作流 JSON 保存/加载 | ✅【核实】 | ✅ 项目导入/导出 JSON【核实：`features.mdx`】 | |
| 工作流随图元数据自携带 | ✅ PNG 嵌入完整工作流+seed，拖图即恢复【核实：README + 知乎 §4.3】 | ❌ 生成图不内嵌工作流 | |
| 局部重执行 / 缓存 | ✅ 只跑变化的部分，相同图二次提交不重复执行【核实：README "Notes"】 | ❌ 每次生成都是全新 API 调用，无缓存 | |
| 队列 / 异步执行 | ✅ 异步队列、可打断、优先级【核实：README + 快捷键 Ctrl+Enter/Ctrl+Alt+Enter】 | 🟡 单任务前台直连，无队列管理 | |
| 自定义节点 | ✅ Python 自定义节点 + ComfyUI-Manager【核实】 | ✅ TypeScript 插件 SDK + 远程 URL 安装 + 官方注册表【核实：`plugins/canvas/README.md`】 | |
| 自定义节点生态规模 | ✅ 3000+【核实：知乎】 | 🟡 少量官方插件（markdown/svg/html/panorama/sticky-note） | |
| API / 集成 | ✅ 本地 API + Python/TS SDK + MCP + Cloud API + Comfy CLI【核实：docs 开发者页】 | 🟡 浏览器直连 + 本地 Canvas Agent(MCP) + 自定义调用脚本【核实：`features.mdx`】 | |
| 模型管理 | ✅ 本地 models/ 目录 + extra_model_paths.yaml + Manager 装模型【核实】 | ✅ 云端模型列表拉取（`/models`）+ 多通道配置【核实：`image.ts` `fetchImageModels`】 | |
| 离线运行 | ✅ `--offline` 强制离线【核实：README】 | ✅ 前端本地化，但生图必须联网（依赖 API） | |
| 提示词库 | 🟡 无内置提示词库（靠社区工作流/模型页） | ✅ 7 个开源来源 + 自定义 JSON + 搜索/标签【核实：`features.mdx`】 | |
| 对话式助手 | ❌（靠第三方节点/Agent） | ✅ 画布助手 + 本地 Agent 流式【核实：`features.mdx`】 | |
| 多人协作 | 🟡 官方云有，本地无 | ❌（localStorage/WebDAV） | |
| 移动端 | 🟡 无原生移动编辑 | 🟡 窄屏抽屉【核实：`docs/02`】 | |

## 4. 技术架构 / 实现方式对比（重点）

### 4.1 运行时形态：本地推理服务 vs 浏览器 SPA

- **ComfyUI【核实：README + docs 开发者页】**：`python main.py` 启动一个本地服务，前后端分离——**核心仓库（ComfyUI Core，Python 后端）+ 前端仓库（ComfyUI_frontend，Vue + TypeScript + Vite）+ 桌面客户端（Comfy Desktop）**三个仓库，周发布节奏。后端负责模型加载、图执行、推理；前端只做交互与展示，通过 HTTP/WebSocket 与后端通信。
- **无限画布【核实：`repo/web/package.json`、`features.mdx`】**：单一 React SPA，**没有项目自建后端**。浏览器前端用 axios/fetch 直接请求用户配置的 OpenAI 兼容 `Base URL + API Key`（`web/src/services/api/image.ts`），模型、图片、生成记录都存在浏览器本地（localforage）。

> 这一条是**最根本的差异**：ComfyUI 把"算力"和"模型"握在本地后端，前端只是壳；无限画布把"算力"外包给云端 API，前端自己就是全部。

### 4.2 前端技术栈

| 项 | ComfyUI 前端 | 无限画布前端 |
| --- | --- | --- |
| 框架 | Vue 3 + TypeScript（`vue-tsc`）【核实：`ComfyUI_frontend/package.json`】 | React 19.2.5 + TypeScript【核实：`web/package.json`】 |
| 构建 | Vite | Vite 7 |
| 状态/UI | Pinia（Vue 生态，未逐项核实）+ 自绘画布 | Zustand + Ant Design 6 + Tailwind 4【核实：`web/package.json`】 |
| 画布实现 | 自研前端画布（非 LiteGraph，早期是 LiteGraph.js，现重写）【推断：早期 LiteGraph 为公开事实】 | **自建 DOM 无限画布**（`translate/scale` 变换，无任何图库依赖）【核实：`docs/01` §1 总表】 |
| 工程化 | Storybook / Playwright / oxfmt / depcruise【核实：package.json scripts】 | oxlint / prettier / vitest(bun test)【核实：package.json】 |

### 4.3 节点模型与类型系统

- **ComfyUI【核实：知乎 §4.2、docs 内置节点页】**：节点 = 输入端口 + 输出端口 + 控件参数。端口是**强类型**的，用颜色区分：`MODEL`（黄）、`CLIP`（橙）、`VAE`（紫）、`LATENT`、`CONDITIONING`、`IMAGE`、`MASK`…只有同类型端口能相连。内置节点分 16 大类（3D/Advanced/Audio/Conditioning/Image/Latent/Loader/Model/Partner/Sampling/Text/Utilities/Utils/Video/API Node/Experimental）【核实：docs 目录】。核心流水线固定为「模型加载 → 文本编码 → 潜空间 → KSampler → VAE 解码 → 保存」。
- **无限画布【核实：`web/src/types/canvas.ts`、`plugins/canvas/README.md`】**：内置 6 种节点类型 `image/text/config/video/audio/group`（`CanvasNodeType` 枚举），其余靠插件（markdown/svg/html/panorama/sticky-note…）。节点数据是 `{id, type, title, position, width, height, metadata}`，**metadata 是一个松散的扁平对象**（prompt/model/size/quality/count/references…），没有"端口类型"概念——类型约束靠插件 `resource()` 返回 `kind: text|image|video|audio` 来隐式表达。

> **关键洞察**：ComfyUI 用**类型化端口**把"这个节点吃 MODEL、吐 LATENT"写成硬约束，连线即类型检查；无限画布用**节点类型（text/image/config…）+ resource 声明**表达"这个节点能当什么素材"，约束更软、更灵活，但也没有编译期的类型安全网。

### 4.4 连线 / 端口模型

- **ComfyUI【核实：知乎 §4.2】**：一个节点可有多组输入/输出端口，每个端口有明确语义（KSampler 有 model/positive/negative/latent_image 四个输入、LATENT 一个输出），颜色同型才能连。
- **无限画布【核实：`web/src/types/canvas.ts:100-104`、`docs/01` §4】**：`CanvasConnection = { id, fromNodeId, toNodeId }` 仅三个字段——**没有 sourceHandle/targetHandle、没有 label、没有 type**。每个节点只有一个右侧输出点（`hasSourceHandle`）和一个左侧输入点，连线是固定「右中点 → 左中点」三次贝塞尔。`docs/01` §4 已给出源码级证据：无 `<text>`、无 `marker-end`、无端口 id。

> 这是无限画布在**画布能力**上对 ComfyUI 差距最大的一处：无法表达"一个节点多个不同类型的出口/入口"，也无法在连线上挂条件/标签。但要注意——**两者的语义需求不同**：ComfyUI 的多端口是"数据流多输入多输出"的刚需；无限画布当前"上游素材 → 生成节点"是单入口聚合，多端口需求尚未出现（详见 §6.2）。

### 4.5 执行引擎（最核心的实现差异）

- **ComfyUI【核实：README "Features" 与 "Notes"】**：
  - **图执行**：按依赖 DAG 执行，只有"输出且所有输入就绪"的子图会被执行；
  - **局部重执行 / 缓存**：只执行本次提交相对上次**发生变化的部分及其下游**，相同图二次提交只跑第一次；
  - **异步队列 + 权重流式加载**：`asynchronous weight streaming`，可在 4GB 显存 + 8GB 内存上跑大模型（饱和 GPU 算力）；
  - **智能显存/内存管理 + 模型卸载 + 量化模型支持**。
  - 这是 ComfyUI 自称"世界最快本地扩散推理引擎"的底气【核实：README 标题】。
- **无限画布【核实：`web/src/lib/canvas/canvas-node-generation.ts`、`web/src/services/api/image.ts`】**：
  - 没有独立执行引擎。触发生成时，`buildNodeGenerationContext` 沿连线**向上游收集** text/image/video/audio 资源 → 拼成 prompt + 参考图列表 → **一次性**调用云端 API（`/images/generations`、`/images/edits` 或 Gemini、或自定义脚本）→ 拿回图片 → 作为新节点插回画布；
  - 没有缓存、没有局部重执行、没有队列；每次都是全新 API 调用，超时 10 分钟（`IMAGE_REQUEST_TIMEOUT_MS`）。

> **一句话概括**：ComfyUI 的执行引擎是"图 → 张量在节点间流动 → 只算变化的局部"；无限画布的"执行"是"图 → 把上游素材拼成一个请求 → 云端算 → 结果回填"。前者是**计算图求值器**，后者是**请求编排器**。这不是缺陷，而是"本地推理"与"云端 API"两种产品形态的必然结果。

### 4.6 工作流数据格式与持久化

- **ComfyUI【核实：README + 知乎 §4.3/4.4 + docs 规范页】**：
  - 工作流保存为 JSON（有 `Workflow JSON`、`Node Definitions` 两份规范）；
  - **生成图 PNG 元数据内嵌完整工作流 + seed**，拖图进画布即可完整复现——这是社区共享工作流的主要方式；
  - 模型是本地文件，按目录分类（checkpoints/vae/loras/controlnet/clip/diffusion_models/upscale_models/embeddings），`extra_model_paths.yaml` 配置多路径。
- **无限画布【核实：`features.mdx`、`repo/AGENTS.md`】**：
  - 项目（画布 + 节点 + 连线 + 助手会话）存 localforage，可选 WebDAV 跨设备同步；
  - 导入/导出 JSON；生成图**不**内嵌工作流；
  - 图片/视频/音频/提示词素材存浏览器本地（IndexedDB 等），AI Key 存浏览器本地。

> **可借鉴点（高性价比）**：把"当前节点参数 + 所用模型 + prompt + 参考图 + seed/结果"写进导出 JSON 或生成图元数据，让一张图能**复现整个生成配置**。这是 ComfyUI 生态能滚起来的隐形基础设施。

### 4.7 插件 / 自定义节点体系

- **ComfyUI【核实：README + 知乎 §3.5】**：自定义节点是 `custom_nodes/` 下的 Python 包（`NODE_CLASS_MAPPINGS` 导出节点类），由 ComfyUI-Manager 统一安装/更新/管理（新版入口在菜单 "Manage Extensions"，卡片式布局）。节点即 Python 类，能直接调 PyTorch/任意 Python 库，能力无上限。
- **无限画布【核实：`plugins/canvas/README.md`】**：自定义节点是独立 TypeScript 目录，`definePlugin({ id, name, version, css, nodes[], setup })`，`CanvasNodeDefinition` 提供 `type/title/icon/defaultSize/defaultMetadata/hasSourceHandle/resource/Content/Panel/toolbar/onDoubleClick`；`ctx` 暴露 `node/theme/scale/updateMetadata/applyOps/emit/on/storage`；支持 URL 动态安装/启用/更新/卸载 + 官方注册表（jsDelivr）。重依赖（three.js/marked）运行时 `import("https://esm.sh/...")` 动态加载。

> **差异**：ComfyUI 插件是**后端能力扩展**（新增一个能真正跑模型的算子），无限画布插件是**前端节点 UI + 编排逻辑扩展**（新增一种节点渲染与资源类型）。前者改变"能算什么"，后者改变"能编排什么"。

### 4.8 API 与集成

- **ComfyUI【核实：docs 开发者页 + README】**：可作为 server 被 API 调用（prompt 队列 API + WebSocket 进度），提供官方 **Python SDK 与 TypeScript SDK**、**Comfy API（云端）/ Comfy Cloud / 自托管**、**Comfy CLI**、**Comfy Router**、**MCP（Agent tools）**，并有 `API Key` 鉴权体系。定位是"可嵌入生产管线的推理引擎"。
- **无限画布【核实：`features.mdx` + `web/src/services/api/`】**：无对外服务 API；通过浏览器直连 OpenAI 兼容协议（`/images/generations`、`/images/edits`、`/responses` 流式、`/models`）与 Gemini 协议，支持**自定义生图/视频调用脚本**（`resolveModelScript` + `runModelPlugin`）适配中转站；另有本地 Canvas Agent 通过 MCP 让 Codex/Claude Code 操作画布。

## 5. 交互与 UX 对比

| 维度 | ComfyUI | 无限画布 |
| --- | --- | --- |
| 建立连线 | 从输出端口拖到同型输入端口（颜色即提示） | 从节点右侧点拖到目标节点左侧点（悬停才显形）【核实：`docs/02` §1.8】 |
| 添加节点 | 双击空白弹快速搜索 / 右键分类菜单【核实：README 快捷键】 | 左栏面板点选/拖拽 + 双击空白新建【核实：`features.mdx` + `docs/02`】 |
| 参数面板 | 参数直接内嵌在节点上（KSampler 的 seed/steps/cfg 直接改） | 右侧属性面板（Inspector）集中编辑【核实：`docs/02`】 |
| 运行方式 | Queue Prompt（Ctrl+Enter）、队列、可打断 | 节点上"生成"按钮触发，单任务 |
| 结果呈现 | 预览节点 + 保存节点 | 结果作为新节点插入画布、批量结果按节点分组【核实：`features.mdx`】 |
| 历史/队列侧栏 | 有 Queue/History 侧栏（v1.2.0）【核实：前端 README】 | 无 |
| 快捷键定制 | 原生支持改键位（v1.3.7）【核实】 | 固定快捷键（P 预览/Space 平移/Ctrl+S 导出…） |
| 原生 i18n | 14 语言（v1.5）【核实】 | i18next（中/英）【核实：`web/package.json`】 |

**易用性结论**：无限画布对"用 API 生图"的普通用户门槛更低（不装 Python/GPU/模型，打开浏览器填 Key 即用）；ComfyUI 对"精确控制模型/参数"的专业用户信息密度更高（参数即节点控件、端口即类型、队列即生产）。

## 6. 差距清单与可借鉴点（按性价比排序）

### 6.1 值得借鉴（直接抄设计，不改架构）

1. **类型化端口 + 颜色编码**【高】。即使不引入完整类型系统，给连线/端口按"文本/图片/视频/音频/配置"着色，能显著降低"连错"的心智成本；当前无限画布连线是裸线（`docs/01` §4.2）。
2. **工作流随图自携带**【高】。导出 JSON 时把节点参数 + 模型 + prompt + 参考图 + seed 一起打进结果，实现"一张图复现整个生成配置"。成本低、生态价值大。
3. **节点控件内嵌参数**【中】。生成配置节点当前在右侧面板编辑，可把高频参数（数量/尺寸/质量/模型）做成节点内嵌控件，减少面板来回切换。
4. **节点静音/旁路（Ctrl+M / Ctrl+B）**【中】。调试工作流时临时禁用某节点或绕过它（连线直通），对 A/B 测试非常有用；无限画布当前无此概念。
5. **子图 / 分组复用**【中】。Group 节点已存在（`CanvasNodeType.Group`），可进一步支持"把一组节点存为可复用模板/子图"。

### 6.2 不建议照搬（形态不匹配）

- **本地图执行引擎 / 局部重执行 / 缓存 / 模型卸载**：这些服务于"本地推理"；无限画布的计算在云端 API，重执行/缓存应发生在**请求层**（如：上游未变则复用上次结果、失败重试、并发队列），而不是复刻张量级执行引擎。若要做，正确方向是"生成结果缓存 + 脏节点失效"而非"图求值器"。
- **Python 自定义节点生态**：无法复刻（3000+ 节点是多年社区积累 + PyTorch 后端能力）。无限画布的对等物是**TypeScript 插件 SDK + 云 API 编排能力**，应继续强化自己的插件契约与官方注册表。

## 7. 我方差异化优势（守住并放大）

| 优势 | 依据 |
| --- | --- |
| 零门槛 | 浏览器即开即用，无需 Python/GPU/模型下载【核实：`features.mdx` + README 快速开始】 |
| 多模型编排 | 同一画布串联文生图/图生图/视频/音频/文本问答，换模型不改工作流【核实：`features.mdx` + `image.ts` 多协议支持】 |
| 云 API 直连 + 中转站适配 | 自定义调用脚本适配任意中转站/自建服务【核实：README 核心功能】 |
| 提示词库 | 7 个开源来源 + 自定义 JSON + 搜索/标签/复制/插入画布【核实：`features.mdx`】 |
| 本地 Agent(MCP) | Codex/Claude Code 直接操作画布，这是 ComfyUI 原生没有的"AI 编排画布"能力【核实：`features.mdx` + `canvas-agent/`】 |
| 插件 SDK 是前端语言 | 前端开发者用 TSX 即可写节点，无 Python/GPU 背景门槛【核实：`plugins/canvas/README.md`】 |

## 8. 证据来源

**ComfyUI 一手来源（本轮 ego 浏览器/web_fetch 实核）**

- 官方仓库 README：`https://github.com/Comfy-Org/ComfyUI`（README 全文，含 Features、执行引擎 Notes、快捷键、模型清单、三仓库发布流程、离线参数）
- 官方前端仓库：`https://github.com/Comfy-Org/ComfyUI_frontend`（README + `package.json`，实核 `@comfyorg/comfyui-frontend` v1.60.0、`GPL-3.0-only`、`vue-tsc`/Vite）
- 官方文档：`https://docs.comfy.org/development/overview`（SDK/Server API/Cloud/CLI/Router/MCP、Workflow JSON 与 Node Definitions 规范）；`https://docs.comfy.org/built-in-nodes/overview`（内置节点 16 大类）
- 用户提供教程：`https://zhuanlan.zhihu.com/p/2053788828905763748`（ego 浏览器抓取全文 2.1 万字）

**无限画布一手来源（本地源码）**

- `repo/README.md`、`repo/web/package.json`、`repo/web/src/types/canvas.ts`
- `repo/web/src/components/canvas/canvas-node-generation.ts`、`repo/web/src/services/api/image.ts`
- `repo/plugins/canvas/README.md`、`repo/docs/content/docs/overview/features.mdx`
- `docs/01-开源方案对比.md`（对 infinite-canvas 连线层/插件 SDK 的源码级证据）、`docs/02-交互与UI设计对照.md`

## 9. 未核实项

| 项 | 状态 |
| --- | --- |
| ComfyUI 前端画布的具体渲染实现（Canvas/SVG/WebGL、是否自研） | 未逐行核实，仅确认非 LiteGraph 的 Vue 重写版；如需深挖需读 `ComfyUI_frontend/src` |
| ComfyUI 核心仓库 license 字段 | 前端 `package.json` 已实核 GPL-3.0-only；核心仓库 license 未单独 fetch（业界公认 GPL-3.0），引用前建议再核实 |
| ComfyUI 执行引擎内部实现（`execution.py` 缓存/局部重执行算法细节） | 仅 README 声明级核实，未读源码 |
| 3000+ 自定义节点、11.4 万 stars | 引自用户提供的知乎教程（2026 年视角），未二次抓 GitHub API 复核 |
| ComfyUI Cloud / Comfy API 的具体定价与鉴权细节 | 未展开，仅确认其存在性 |
