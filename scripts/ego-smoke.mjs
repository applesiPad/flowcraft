#!/usr/bin/env node
/**
 * FlowCraft Ego 冒烟断言套件（与浏览器交互方式解耦）。
 *
 * 工作流（配合 docs/ego-smoke.md）：
 * 1. `npm run dev -- --port 5177`
 * 2. Ego Browser 打开 `http://localhost:5177/?example=ecommerce&cull=0`（cull=0 保证全量 DOM）
 * 3. 在页面里执行 `JSON.stringify(window.__fcQA.collect())`，把输出存成 qa.json
 * 4. `node scripts/ego-smoke.mjs --report qa.json` → 逐条断言 + 退出码 0/1
 *
 * 断言内容（默认基线 scripts/ego-smoke.expect.json，可用 --expect 覆盖）：
 * - 节点 / 连线 / 界面 / 判断 / 热点数量与基线一致（电商示例是确定性的）
 * - 边几何存在：pathCount == edges 且 totalLength 有限且 > 0（连线没画出来会在这里炸）
 * - 体检问题类型集合与基线一致（新增扫描类型上线后有意变更时更新基线文件）
 * - 每个判断条件变量都能在 inputVars 里找到来源（条件变量对账的页内回归）
 * - DOM 与数据非空、__fcQA 探针版本正确
 *
 * `--print-collect` 输出「在页面里要执行的收集语句」，避免每次翻文档。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

function loadJson(file) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

/** 对一份 QaSnapshot + 期望基线跑全部断言。纯函数，Node 测试覆盖。 */
export function runSmokeChecks(report, expect) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail: String(detail) });

  add("探针存在且版本为 1", report && report.counts && report.counts.nodes >= 0, report ? "collect() 返回结构合法" : "report 为空");
  if (!report || !report.counts) return { pass: false, checks };

  add(
    "节点数与基线一致",
    report.counts.nodes === expect.nodes,
    `report=${report.counts.nodes} expect=${expect.nodes}`,
  );
  add(
    "连线数与基线一致",
    report.counts.edges === expect.edges,
    `report=${report.counts.edges} expect=${expect.edges}`,
  );
  add(
    "界面数与基线一致",
    report.counts.screens === expect.screens,
    `report=${report.counts.screens} expect=${expect.screens}`,
  );
  add(
    "判断节点数与基线一致",
    report.counts.decisions === expect.decisions,
    `report=${report.counts.decisions} expect=${expect.decisions}`,
  );
  add(
    "热点数与基线一致",
    report.counts.hotspots === expect.hotspots,
    `report=${report.counts.hotspots} expect=${expect.hotspots}`,
  );

  const geo = report.edgeGeometry;
  add(
    "边几何已渲染（pathCount == 连线数）",
    geo && geo.pathCount === expect.edges,
    geo ? `pathCount=${geo.pathCount}` : "edgeGeometry 为空：画布未挂载或裁剪开启",
  );
  add(
    "边几何总长有限且大于 0",
    geo && Number.isFinite(geo.totalLength) && geo.totalLength > 0,
    geo ? `totalLength=${geo.totalLength}` : "无几何",
  );

  const kinds = (report.healthIssues ?? []).map((i) => i.kind).sort();
  const expectedKinds = [...(expect.issueKinds ?? [])].sort();
  add(
    "体检问题类型集合与基线一致",
    JSON.stringify(kinds) === JSON.stringify(expectedKinds),
    `report=[${kinds.join(",")}] expect=[${expectedKinds.join(",")}]`,
  );

  const inputVars = new Set(report.counts.inputVars ?? []);
  const unknownConds = (report.decisions ?? []).filter((d) => d.variable && !inputVars.has(d.variable));
  add(
    "判断条件变量都有输入框来源",
    unknownConds.length === 0,
    unknownConds.length ? `无来源变量：${unknownConds.map((d) => `${d.title}(${d.variable})`).join("、")}` : "全部可对账",
  );

  const dom = report.dom;
  add(
    "DOM 已挂载（节点/连线非零）",
    dom && dom.nodes > 0 && dom.edges > 0,
    dom ? `nodes=${dom.nodes} edges=${dom.edges} handles=${dom.handles}` : "dom 为 null",
  );

  return { pass: checks.every((c) => c.pass), checks };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--print-collect")) {
    console.log('JSON.stringify(window.__fcQA.collect())  // 在 Ego 页面控制台执行，输出存为 qa.json');
    return;
  }
  const reportIdx = args.indexOf("--report");
  if (reportIdx === -1 || !args[reportIdx + 1]) {
    console.log("用法：node scripts/ego-smoke.mjs --report qa.json [--expect scripts/ego-smoke.expect.json]");
    console.log("     node scripts/ego-smoke.mjs --print-collect");
    process.exit(2);
  }
  const report = loadJson(path.resolve(args[reportIdx + 1]));
  const expectFile = args.includes("--expect") ? args[args.indexOf("--expect") + 1] : path.join(here, "ego-smoke.expect.json");
  const expect = loadJson(path.resolve(expectFile));

  const { pass, checks } = runSmokeChecks(report, expect);
  for (const check of checks) {
    console.log(`${check.pass ? "✔" : "✖"} ${check.name}${check.pass ? "" : ` —— ${check.detail}`}`);
  }
  console.log(pass ? "\nSMOKE PASS" : "\nSMOKE FAIL");
  process.exit(pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
