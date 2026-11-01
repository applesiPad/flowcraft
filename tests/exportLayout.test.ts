import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExportFilename,
  computeFitViewport,
  computePdfPlacement,
  type ExportBounds,
} from "../src/flow/exportLayout.ts";

function corners(bounds: ExportBounds, viewport: { x: number; y: number; zoom: number }) {
  return [
    { x: bounds.x * viewport.zoom + viewport.x, y: bounds.y * viewport.zoom + viewport.y },
    {
      x: (bounds.x + bounds.width) * viewport.zoom + viewport.x,
      y: (bounds.y + bounds.height) * viewport.zoom + viewport.y,
    },
  ];
}

test("导出视口会把全部内容放进画布并保留边距", () => {
  const bounds = { x: 120, y: 80, width: 1200, height: 700 };
  const viewport = computeFitViewport(bounds, 1000, 800, { padding: 0.08 });
  const [topLeft, bottomRight] = corners(bounds, viewport);

  assert.ok(viewport.zoom > 0, "缩放必须为正数");
  assert.ok(topLeft.x >= 40, `左边距不足: ${topLeft.x}`);
  assert.ok(topLeft.y >= 40, `上边距不足: ${topLeft.y}`);
  assert.ok(bottomRight.x <= 960, `右边距不足: ${bottomRight.x}`);
  assert.ok(bottomRight.y <= 760, `下边距不足: ${bottomRight.y}`);
});

test("画布尺寸更大时，同一内容应获得更大的缩放", () => {
  const bounds = { x: 0, y: 0, width: 1000, height: 600 };
  const small = computeFitViewport(bounds, 800, 600);
  const large = computeFitViewport(bounds, 1600, 1200);
  assert.ok(large.zoom > small.zoom);
});

test("空画布返回可用的默认视口而不是 Infinity", () => {
  const viewport = computeFitViewport({ x: 0, y: 0, width: 0, height: 0 }, 0, 0);
  assert.deepEqual(viewport, { x: 0, y: 0, zoom: 1 });
});

test("PDF 排版保持图片比例并完整落在页面边距内", () => {
  const placement = computePdfPlacement(1600, 900, 420, 297, 12);
  const ratio = placement.width / placement.height;

  assert.ok(Math.abs(ratio - 1600 / 900) < 0.001, `比例被改变: ${ratio}`);
  assert.ok(placement.x >= 12 - 0.001);
  assert.ok(placement.y >= 12 - 0.001);
  assert.ok(placement.x + placement.width <= 420 - 12 + 0.001);
  assert.ok(placement.y + placement.height <= 297 - 12 + 0.001);
});

test("导出文件名包含格式和时间戳且不含非法路径字符", () => {
  const filename = buildExportFilename("FlowCraft 流程/测试", "png", new Date("2026-10-31T08:09:10"));
  assert.equal(filename, "FlowCraft-流程-测试-20261031-080910.png");
});
