import assert from "node:assert/strict";
import { test } from "node:test";
import { runSmokeChecks } from "../scripts/ego-smoke.mjs";
import { collectQaSnapshot } from "../src/flow/qaProbe.ts";
import { initialEdges, initialNodes } from "../src/flow/sample.ts";

const expect = JSON.parse((await import("node:fs")).readFileSync(new URL("../scripts/ego-smoke.expect.json", import.meta.url), "utf-8"));

/** 用示例图合成一份「浏览器里 collect 出来」的报告：补上 Node 里拿不到的 DOM 字段 */
function fakeBrowserReport() {
  const snap = collectQaSnapshot({ nodes: initialNodes, edges: initialEdges });
  return {
    ...snap,
    dom: { nodes: 13, edges: 17, handles: 50 },
    edgeGeometry: { pathCount: 17, totalLength: 15230.48, pathHash: 4112298526 },
  };
}

test("冒烟断言：示例图 + 基线全绿", () => {
  const { pass, checks } = runSmokeChecks(fakeBrowserReport(), expect);
  const failed = checks.filter((c) => !c.pass);
  assert.deepEqual(failed, []);
  assert.equal(pass, true);
});

test("冒烟断言：每条检查真的能抓到回归", () => {
  const report = fakeBrowserReport();
  report.counts.edges = 13; // 丢一条连线
  report.edgeGeometry.pathCount = 13;
  report.healthIssues.push({ id: "condVarUnknown:d-x", kind: "condVarUnknown" }); // 体检集合变了
  report.decisions.push({ id: "d-x", title: "新判断", variable: "ghost" }); // 条件变量无来源
  const { pass, checks } = runSmokeChecks(report, expect);
  assert.equal(pass, false);
  const failedNames = checks.filter((c) => !c.pass).map((c) => c.name);
  assert.ok(failedNames.includes("连线数与基线一致"));
  assert.ok(failedNames.includes("边几何已渲染（pathCount == 连线数）"));
  assert.ok(failedNames.includes("体检问题类型集合与基线一致"));
  assert.ok(failedNames.includes("判断条件变量都有输入框来源"));
});

test("冒烟断言：空 report 直接失败不抛错", () => {
  const { pass } = runSmokeChecks(null, expect);
  assert.equal(pass, false);
});
