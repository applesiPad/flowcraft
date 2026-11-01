# FlowCraft 性能基线与可视区裁剪决策（2026-11-01）

> 对应 `GRAPH.md`「下一步建议」第 1 项：为 100+ 节点建立性能基线，再决定是否启用可视区裁剪。
> 结论：**默认启用 `onlyRenderVisibleElements`**，工具栏可切换，导出/打印路径自动全量渲染兜底。

## 1. 测量方法

- 被测构建：`npm run build` 产物 + `vite preview`（http://127.0.0.1:5178），避免 dev 转换与 React 开发模式干扰。
- 合成图入口：`/?bench=small|medium|large&cull=0|1`（`src/flow/benchGraph.ts`，mulberry32 种子 20261101，确定性布局；压测模式不读写 localStorage）。
  - small：30 节点 / 39 边；medium：100 / 130；large：200 / 240。
  - 每节点为完整 screen 卡片（宽 320，7 元素 + 热点），边含链式、行内回边（sourceHandle=back）与跨列前向边——与真实工作负载同量级的路由压力。
- 指标：
  - `mountToFitMs`：bench 全局建立 → fitView 标记完成（performance.now 差值）。
  - `domCounts()`：`.react-flow__node / .react-flow__edge / .react-flow__handle / .fc-hotspot-pin` 常驻 DOM 计数。
  - FPS：页内 rAF 采样（`measureFps`），每场景先做 500ms 心跳校验（ticks≥15 才采信，剔除后台节流伪影）。
  - `longtask`：PerformanceObserver 在 pan/drag 窗口内逐条记录主线程阻塞时长。
- 交互：真实滚轮平移（局部视角 zoom≈0.9）、真实鼠标拖拽可见节点；Ego Browser 驱动。
- 已知坑（第 1 轮踩中，第 2 轮修正）：页面不可见时 rAF 节流到 1Hz，fps 读数失真；`page.goto` 的 load 超时本身就是主线程阻塞信号。

## 2. 基线数据（第 2 轮，生产构建，心跳校验通过）

| 场景 | 裁剪 | mount→fit | 全图 DOM（节点/handle） | 局部 zoom≈0.9 DOM | idle fps | 平移 fps | 平移 longtask | 拖拽 fps | 拖拽 longtask |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small 30 | 关 | 0.71s | 30 / 200 | 30 / 200 | —* | —* | — | —* | — |
| medium 100 | 关 | 2.52s | 100 / 668 | **100 / 668** | 60 | **1**（rAF 饿死） | 12×78–107ms | **2** | **21 条：2.3s–11.4s** |
| medium 100 | 开 | 5.41s | 100 / 668 | **8 / 52** | 60 | 55.7 | 8×56–128ms | 59.3 | **0** |
| large 200 | 关 | **25.2s** | 200 / 1334 | 200 / 1334 | 60 | 44.4 | 13×200–226ms | 58 | 0** |
| large 200 | 开 | 2.79s | 160 / 1066 | **6 / 40** | 60 | 59 | 7×69–190ms | 58 | 0 |

\* small 场景该轮心跳未通过（窗口未前台），FPS 不采信；第 1 轮同场景拖拽 fps≈13 可作参考。
\** large 无裁剪拖拽本轮恰好选中了短边节点，未复现 medium 的阻塞；medium 行是代表性最坏情况。

## 3. 结论与依据

1. **交互卡顿的根源是「全量常驻 DOM + 每边订阅全量节点几何」**：medium 无裁剪时一次节点拖拽触发 21 条 longtask（最长 11.4s，累计 >90s 主线程阻塞）；开启裁剪后同操作 longtask 归零、fps 59。
2. **裁剪收益只出现在局部视角**（用户实际工作视角）：zoom≈0.9 时 medium 常驻节点 100→8（-92%），large 200→6（-97%）；全图 fitView 时两者 DOM 相同，裁剪无收益但也无额外代价（large 无裁剪 fitView 被 minZoom=0.1 钳制在 0.08，画布仍全量渲染）。
3. **挂载代价不对称**：medium 全图挂载 2.5s→5.4s（fitView 时全部节点都在视口内，裁剪反而多一轮可见性计算）；large 反而 25.2s→2.8s（不可见节点跳过渲染/测量）。日常 minZoom 0.5 的局部视角下，裁剪挂载更快。
4. **决策：默认开启**。代价（全图 fitView 时 medium 挂载 +2.9s 一次性）远小于收益（拖拽/平移从秒级卡死恢复到 60fps）。
5. 遗留优化项（**已于同日第 2 轮完成，见 §6**）：`FlowEdge` 的 `laneIndex/peerInfo` 每边 O(E) 扫描 store，medium 无裁剪时 130 边 × 130 边 = 1.7 万次比较/帧，是 longtask 的放大器；边路由 LRU 512 在 200 节点图上会抖动。裁剪把常驻边数压到 <20，正好绕开这两个热点。

## 4. 落地改动

- `src/App.tsx`
  - `cull` 默认 `true`；偏好持久化 `flowcraft.cull.v1`（`"0"` 关闭）；`?bench=` 入口仍由 URL `cull` 参数控制、不落偏好。
  - 工具栏「视图」组新增裁剪开关按钮（`.fc-cull-toggle`，crop 图标，`aria-pressed`）。
  - `withFullRender()`：导出 PNG/SVG/PDF 与打印前，若裁剪开启则临时全量渲染，轮询 `getNodes()` 直到所有节点 `measured` 就绪（上限 6s），双 rAF 后再克隆 DOM；结束恢复用户开关。
  - `<ReactFlow onlyRenderVisibleElements={cull && !renderAllForExport}>`。
- `src/flow/Icon.tsx`：新增 `crop` 图标。
- `src/flow/benchGraph.ts`：合成图生成 + `measureFps` / `domCounts` / `startFps` / longtask 钩子；`tests/benchGraph.test.ts` 6 项单测（计数预算、确定性、端点/热点合法性、回边数量、网格间距、导出函数类型）。

## 5. 复现命令

```powershell
npm run build; npm run preview   # http://127.0.0.1:5178
# 浏览器直接打开对比：
#   /?bench=large&cull=0  vs  /?bench=large&cull=1
# Ego 压测脚本（本机）：C:\Users\32544\ego\fc-bench-20261101\bench-round2.mjs
# 第 2 轮 A/B 回归脚本：C:\Users\32544\ego\fc-bench-20261101\bench-round5-derived-edges.mjs
# 确定性派生微基准：node --experimental-strip-types C:\Users\32544\ego\fc-bench-20261101\bench-derived.ts
```

## 6. 第 2 轮：边共享派生状态 + LRU 扩容（同日完成）

针对 §3.5 两个热点的整改，目标是**只改成本、不改行为**：

- `src/flow/edgeStoreSelectors.ts`（新增）：`deriveEdgeFlowState(state)` 一次派生 zoom / `nodeGeometries`（O(N)）/ `laneGroups`（Map，键 `target\u241FtargetHandle`，O(E log E)）/ `viewport` / 按目标记忆化的 `avoidRects`；结果按 zustand state 对象存 WeakMap——每次 `set` 产生新对象即天然失效，同一帧内所有边共享同一次派生。`edges.tsx` 每边只做 O(1) 查询。
- `edgeRoutingCache.ts`：默认 512 → 2048；几何数组实例经 WeakMap 序列缓存，键构造不再每边 `join` 全量节点。

验证（脚本与日志在 `C:\Users\32544\ego\fc-bench-20261101\`：`round5-baseline.log` / `round5-step2.log`）：

| 指标 | 基线 `23b2db7` | 第 2 轮 | 判定 |
| --- | --- | --- | --- |
| 电商 14 边路径 d 校验和（1480×742） | 4112298526 | 4112298526 | 逐字节一致 |
| 总路径长度 / 交叉 | 11834.31 / 1 组（e6-e11） | 11834.31 / 1 组 | 一致 |
| 标签 lane（14 条） | e1#0 … e14#1 | 同一行输出 | 一致 |
| large DOM（200 节点裁剪） | 140/171/934/794 | 140/171/934/794 | 一致 |
| 每帧逐边派生成本（Node 确定性微基准，200 节点/240 边） | 2.68 ms | 0.06 ms | ≈43× |

单测：`tests/edgeStoreSelectors.test.ts` 9 项等价性/缓存断言；套件 140 → 149 全绿。浏览器 drag-fps 在两轮间受窗口前台抖动影响（longtask 尾部含 10s 级离屏渲染阻塞），不采信；行为一致性以逐字节回归为准。
