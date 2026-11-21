# 05 · ComfyUI 全功能清单 × 第三方 API 化映射（非本地部署视角）

> 前提：**不做本地部署**，通过第三方 API（OpenAI 兼容 / Gemini / 中转站聚合）实现生成。
> 目的：把 ComfyUI 的全部功能逐项列出，标出在"纯 API"路线下——哪些与你无关、哪些可借鉴、哪些取决于你的 API 供应商。
> 本文是对 <docs/04-ComfyUI与无限画布对比.md> §3/§6 的**补全 + 重新切片**，补齐了 04 里漏掉的 HDR/模板生态/云服务等项。
> 核实时间：2026-10-31。证据分级同 04：〔核实〕有一手来源 / 〔推断〕基于代码与常识。

## 0. 一句话结论

你走第三方 API，**ComfyUI 的"本地推理引擎"这半壁江山对你完全无关**；你要做的是：① 抄它**编排层**的几个前端概念（类型化端口、工作流自携带、任务队列），② 把你 **API 供应商能提供的生成能力**映射成你的节点类型。真正的工作量很小，且都在前端。

## 1. 三堆分类原则

| 堆 | 定义 | 你的态度 |
| --- | --- | --- |
| **A · 本地推理专有** | 只有"自己跑模型"才存在的功能 | 无关，跳过 |
| **B · 编排/交互层** | 节点图/工作流/UI 层面的功能 | 可借鉴，前端活，低成本 |
| **C · 生成本身** | 出图/出视频/后处理的能力 | 取决于 API 供应商有没有对应 endpoint |

## 2. 全功能清单与逐项映射

### 2.1 生成能力（C 堆）

| ComfyUI 功能 | 第三方 API 场景 | 结论 |
| --- | --- | --- |
| 文生图（SD/SDXL/Flux/Qwen…） | OpenAI `/images/generations`、Gemini `generateContent` | ✅ 通用，你已支持〔核实：`image.ts`〕 |
| 图生图 / 参考图编辑 | OpenAI `/images/edits`、Gemini 多图输入 | ✅ 通用，你已支持〔核实：`image.ts` `requestEdit`〕 |
| 文本生成（LLM） | `/responses` 流式、Gemini | ✅ 通用，你已支持 |
| 视频生成 | Seedance/Kling/Wan/H3 等专有 API | 🔗 取决于供应商（你 README 已列这些中转站） |
| 音频生成 / TTS | 专有 API | 🔗 取决于供应商 |
| 3D 生成（Hunyuan3D/TripoSplat） | 几乎无公开 API | ❌ 基本不可得 |
| 批量生成 | API 的 `n`/batch 参数 | ✅ 通用 |

### 2.2 控制与后处理（C 堆，多数是专有能力）

| ComfyUI 功能 | 第三方 API 场景 | 结论 |
| --- | --- | --- |
| 局部重绘 inpainting | 部分生图 API 支持（带 mask 参数） | 🔗 取决于供应商 |
| 外扩 outpainting | 同上 | 🔗 取决于供应商 |
| 蒙版 / 图像合成 compositing | 可前端用 Canvas API 自己拼，不需 AI | ✅ 前端可做（非 AI） |
| ControlNet 精确构图（Canny/Depth/Pose/Scribble） | **通用生图 API 没有**，专有 API 才有 | ❌ 多数不可得 |
| 自动分割 / 抠图（GroundingDINO + SAM / RMBG） | 专有 API 才有 | ❌ 多数不可得 |
| 放大 / 超分（ESRGAN 等） | 专有 API 或前端算法 | 🔗 视供应商 |
| 深度估计 / 帧插值 | 专有 API | ❌ 多数不可得 |
| 模型合并 | 纯本地权重操作，无 API | ❌ 无关（A 堆） |

### 2.3 模型体系（A 堆，与你无关）

Checkpoint / Diffusion Model(UNET) / VAE / CLIP / LoRA / ControlNet / Embedding / Upscale Model / GGUF 量化——**这些都是本地模型文件**，你走 API 全部不碰。〔核实：知乎 §5 + README〕

### 2.4 执行引擎（A 堆，与你无关）

| ComfyUI 功能 | 说明 | 结论 |
| --- | --- | --- |
| 局部重执行 / 缓存 | 只跑变化的子图 | ❌ 本地算力场景 |
| 异步队列 / 优先级 / 打断 | 本地任务调度 | 🔗 可借鉴"概念"（你的 API 异步任务轮询是另一套） |
| 权重流式加载 / 显存管理 / 模型卸载 / 量化 | 4GB 显存跑大模型 | ❌ 本地 GPU 场景 |
| 离线运行 --offline | 本地不联网 | ❌ 你恰恰相反，必须联网 |

### 2.5 工作流与数据（B 堆，可借鉴，重点）

| ComfyUI 功能 | 你的 API 场景 | 借鉴价值 |
| --- | --- | --- |
| 工作流保存为 JSON | 你已经能导出 JSON | ✅ 已有 |
| **工作流随图元数据自携带**（PNG 内嵌完整配置 + seed，拖图复现） | 把你的"节点参数 + 模型 + prompt + 参考图 + seed"打进导出结果 | ★★★ 高价值，建议做 |
| 子图 / 分组 / 模板复用 | Group 节点已有，可扩展成"可复用子图模板" | ★★ 中 |
| **App Mode**（把复杂流封装成简单 UI 给下游用） | 可做成"预设模板一键套用" | ★★ 中 |
| 工作流模板库 / 画廊生态（官方 Gallery、openart.ai、comfyworkflows.com、Civitai） | 你可以做"提示词库 + 生成预设库" | ★ 低（生态难复制） |

### 2.6 UI 与交互（B 堆，可借鉴，前端活）

| ComfyUI 功能 | 你现在的状态 | 借鉴价值 |
| --- | --- | --- |
| 节点图 + 连线 + 手势（平移/缩放/框选） | ✅ 已有〔核实：`docs/02`〕 | — |
| **类型化端口 + 颜色区分** | ❌ 当前连线裸线、无类型〔核实：`docs/01` §4.2〕 | ★★★ 高，几行就能做 |
| 参数内嵌节点（KSampler 的 seed/steps/cfg 直接改） | 当前在右侧面板 | ★★ 中 |
| 队列 / 历史 / 任务状态侧栏 | ❌ 无 | ★★ 中（API 异步任务正好需要进度/状态 UI） |
| 节点静音 / 旁路（Ctrl+M / Ctrl+B） | ❌ 无 | ★★ 中（A/B 测试、调试） |
| 节点折叠 / 分组（Alt+C / Ctrl+G） | Group 有，折叠无 | ★ 低 |
| 双击空白快速搜索节点 | 左栏面板已有 | — |
| 快捷键定制 | 固定快捷键 | ★ 低 |
| 原生 i18n（14 语言） | i18next 中/英 | — |
| 遮罩编辑器 / 集成终端 | 你有蒙版编辑弹窗 | ★ 低 |

### 2.7 扩展与集成

| ComfyUI 功能 | 你的 API 场景 | 结论 |
| --- | --- | --- |
| 自定义节点（Python + Manager，3000+） | 你有 TS 插件 SDK，不用学 Python | ✅ 已有对等物，方向不同但够用 |
| 本地 API / Python/TS SDK | 你不需要对外服务 API | 🔗 看未来是否需要 |
| Comfy Cloud / Comfy API（官方云） | 你走第三方 API，不用它的云 | ❌ 无关 |
| Comfy CLI / Comfy Router | 部署工具 | ❌ 无关 |
| MCP（Agent tools） | 你有本地 Canvas Agent(MCP) | ✅ 已有 |
| Partner Nodes（Nano Banana/Seedance 等闭源） | 你直接找对应中转站即可 | 🔗 供应商 |

### 2.8 输出与格式

| ComfyUI 功能 | 你的 API 场景 | 结论 |
| --- | --- | --- |
| 高位深/HDR（16-bit PNG、32-bit EXR、10-bit AVIF、HDR 视频） | 一般 API 只回标准 PNG/JPG；供应商若给 HDR 才能用 | 🔗 多数不可得 |
| 标准 PNG/JPG 保存 | ✅ 已有 | — |

## 3. API-first 最终结论：你实际要做的清单

**全部都在前端，且工作量很小**：

1. **类型化端口 + 颜色区分**〔★★★〕——给连线/端口按 文本/图片/视频/音频/配置 着色，几行 CSS + 一个 `resource` 类型字段。
2. **工作流自携带**〔★★★〕——导出 JSON 时把节点参数 + 模型 + prompt + 参考图 + seed 一起存进结果，"一张图复现整套生成配置"。
3. **任务队列/状态侧栏**〔★★〕——你的 API 调用如果是异步的（视频/音频），补一个"生成中/成功/失败/进度"的状态 UI。
4. **节点旁路/静音**〔★★〕——调试和 A/B 测试用。
5. **C 堆映射表**〔必须做〕——把你选定 API 供应商的 endpoint 清单，逐条对应到你的节点类型（见 §2.1/2.2 的 ✅/🔗/❌ 标注）。

**不需要做的**（明确排除，别浪费时间）：本地执行引擎、模型管理、权重流、显存优化、ControlNet/分割/放大等专有后处理（除非你换一个能提供这些的 API 供应商）、离线运行、HDR 输出。

## 4. 证据来源

同 <docs/04-ComfyUI与无限画布对比.md> §8：
- ComfyUI 官方 README（`Comfy-Org/ComfyUI`）——含高位深/HDR、内置工具清单、执行引擎、三仓库、离线参数
- ComfyUI_frontend README + package.json——i18n/遮罩编辑器/终端/快捷键定制/队列历史侧栏
- docs.comfy.org——内置节点 16 大类、开发者/API/Cloud/CLI/Router/MCP
- 知乎教程——节点/端口/KSampler 参数/模型体系/工作流 PNG 自携带
- 本地源码——`web/src/services/api/image.ts`（OpenAI/Gemini/自定义脚本协议）、`web/src/types/canvas.ts`、`plugins/canvas/README.md`（原 clone 于 `repo/`，2026-11-03 已删除）
