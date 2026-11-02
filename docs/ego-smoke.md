# Ego 冒烟回归（固化版）

> 目标：把历轮 Ego 验收里反复手写的确定性断言固化成「一次收集、一条命令」，
> 每轮回归不再从零写脚本。交互性的断言（拖拽手感、动效观感）仍然人工看。

## 用法（3 步）

```powershell
# 1. 起服务
cd C:\Users\32544\Desktop\画布\flowcraft
npm run dev -- --port 5177
```

2. Ego Browser 打开 `http://localhost:5177/?example=ecommerce&cull=0`
   （`cull=0` 关闭可视区裁剪，保证全量 DOM；电商示例是确定性数据）。
   在页面里执行收集语句，把输出保存为 `qa.json`：

   ```js
   JSON.stringify(window.__fcQA.collect())
   ```

```powershell
# 3. 跑断言
node scripts/ego-smoke.mjs --report qa.json
# ✔ 节点数与基线一致 …
# SMOKE PASS（退出码 0）/ SMOKE FAIL（退出码 1）
```

- 基线：[scripts/ego-smoke.expect.json](../scripts/ego-smoke.expect.json)
  （电商示例 12 节点 / 14 边 / 8 界面 / 2 判断 / 31 热点，体检恰好 1 未接线主按钮 + 1 死路）。
- 忘记收集语句：`node scripts/ego-smoke.mjs --print-collect`。
- 断言逻辑本身有 Node 测试：`tests/egoSmoke.test.ts`（含「每条检查真的能抓到回归」的反例）。

## 断言覆盖

| 检查 | 抓什么回归 |
| --- | --- |
| 节点/连线/界面/判断/热点数量 | 示例数据被意外改掉、加载失败 |
| 边几何 pathCount == 边数、totalLength > 0 | 连线没渲染、路由整体失效 |
| 体检问题类型集合 | 健康检查误报/漏报、示例图被改 |
| 判断条件变量 ⊆ inputVars | 条件变量无来源（演示翻车项） |
| DOM 已挂载 | 白屏、React Flow 崩溃 |

## 何时更新基线

有意变更示例图或健康检查类型集合时，更新 `scripts/ego-smoke.expect.json` 并在提交说明里写明原因；
基线变更要能在 Node 侧复现（`collectQaSnapshot` 对 sample 的输出）。

## 探针

`window.__fcQA` 由 `src/flow/qaProbe.ts` 安装，`collect()` 返回：

- `counts`：节点/连线/界面/判断/动作/备注/热点数量 + 全部输入变量名
- `dom`：常驻 DOM 计数（裁剪开启时会小于 counts，属预期）
- `edgeGeometry`：主路径条数 / 总长 / FNV-1a pathHash（与历史 round 的口径一致，可做逐字节对比）
- `healthIssues` / `decisions`：体检问题与判断条件清单
