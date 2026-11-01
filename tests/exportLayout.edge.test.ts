import assert from "node:assert/strict";
import test from "node:test";
import { computeFitViewport, computePdfPlacement, buildExportFilename } from "../src/flow/exportLayout.ts";

test("padding 为 0 时内容贴满画布", () => {
  const viewport = computeFitViewport({ x: 100, y: 50, width: 800, height: 400 }, 800, 400, { padding: 0 });
  assert.deepEqual(viewport, { x: -100, y: -50, zoom: 1 });
});

test("超宽内容按宽度缩放，超高内容按高度缩放", () => {
  const wide = computeFitViewport({ x: 0, y: 0, width: 2000, height: 400 }, 1000, 1000, { padding: 0 });
  const tall = computeFitViewport({ x: 0, y: 0, width: 400, height: 2000 }, 1000, 1000, { padding: 0 });
  assert.equal(wide.zoom, 0.5);
  assert.equal(tall.zoom, 0.5);
});

test("PDF 页面边距过大时自动收缩，不产生负尺寸", () => {
  const placement = computePdfPlacement(1000, 500, 100, 80, 100);
  assert.ok(placement.width >= 0);
  assert.ok(placement.height >= 0);
  assert.ok(placement.x >= 0);
  assert.ok(placement.y >= 0);
});

test("文件名处理空标题和连续空白", () => {
  assert.equal(buildExportFilename("   ", "png", new Date("2026-10-31T08:09:10")), "flowcraft-20261031-080910.png");
  assert.equal(buildExportFilename("A   B", "svg", new Date("2026-10-31T08:09:10")), "A-B-20261031-080910.svg");
});
