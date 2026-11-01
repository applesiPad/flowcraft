import assert from "node:assert/strict";
import test from "node:test";
import { initialEdges, initialNodes } from "../src/flow/sample.ts";

test("电商示例的每条连线都指向实际存在的节点", () => {
  const ids = new Set(initialNodes.map((node) => node.id));
  const dangling = initialEdges
    .filter((edge) => !ids.has(edge.source) || !ids.has(edge.target))
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }));
  assert.deepEqual(dangling, []);
});

test("示例包含完整的主路径与售后闭环", () => {
  assert.equal(initialNodes.length, 12);
  assert.equal(initialEdges.length, 14);
  assert.deepEqual(initialNodes.slice(0, 2).map((node) => node.id), ["n-home", "n-login"]);
  assert.equal(initialEdges.find((edge) => edge.id === "e1")?.source, "n-home");
  assert.equal(initialEdges.find((edge) => edge.id === "e14")?.target, "n-detail-2");
});

test("示例保持横向主路径与下方异常/售后分区", () => {
  const byId = new Map(initialNodes.map((node) => [node.id, node]));
  const main = ["n-home", "n-login", "n-detail", "n-pay", "n-success"].map((id) => byId.get(id));
  assert.deepEqual(main.map((node) => node?.position.y), [180, 180, 180, 180, 180]);
  assert.deepEqual(main.map((node) => node?.position.x), [80, 680, 1280, 1880, 2480]);
  assert.equal(byId.get("d-need-login")?.position.y, 820);
  assert.equal(byId.get("e14"), undefined);
});