import { jsPDF } from "jspdf";
import type { Node } from "@xyflow/react";
import { buildExportFilename, computePdfPlacement } from "./exportLayout.ts";
import { getExportBounds } from "./exportGeometry.ts";
import type { CanvasExportOptions, CanvasExportResult } from "./exportTypes.ts";

type Capture = {
  dataUrl: string;
  width: number;
  height: number;
  blob: Blob;
};

const EXPORT_WIDTH = 1920;
const MAX_EXPORT_HEIGHT = 5000;
const DEFAULT_BACKGROUND = "#0b0e13";

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function captureCanvas(
  nodes: Node[],
  options: CanvasExportOptions,
): Promise<Capture> {
  if (!nodes.length) throw new Error("画布为空，没有可导出的内容");
  const bounds = getExportBounds(nodes, 48);
  if (!bounds.width || !bounds.height) throw new Error("无法计算画布尺寸");

  const scale = Math.min(EXPORT_WIDTH / bounds.width, MAX_EXPORT_HEIGHT / bounds.height, 2);
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  const background = options.background ?? DEFAULT_BACKGROUND;
  const pixelRatio = Math.max(1, Math.min(options.pixelRatio ?? 2, 3));

  options.onProgress?.("正在准备画布…");
  const { toPng, toBlob } = await import("html-to-image");
  const liveCanvas = document.querySelector<HTMLElement>(".fc-canvas");
  if (!liveCanvas) throw new Error("找不到画布节点");

  // 外层负责把导出树移出视口，内层保持相对定位。
  // html-to-image 会把目标节点放进 foreignObject；若目标自身是 fixed，
  // Chromium 会在离屏位置判定其不可绘制，最终只得到背景色。
  const stage = document.createElement("div");
  stage.className = "fc-export-stage";
  stage.setAttribute("aria-hidden", "true");
  stage.style.position = "fixed";
  stage.style.left = "-100000px";
  stage.style.top = "0";
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.overflow = "hidden";
  stage.style.pointerEvents = "none";
  stage.style.background = background;

  const clone = liveCanvas.cloneNode(true) as HTMLElement;
  clone.classList.add("fc-export-clone");
  clone.style.position = "relative";
  clone.style.left = "auto";
  clone.style.top = "auto";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.overflow = "hidden";
  clone.style.background = background;
  const viewport = clone.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("找不到画布视口");
  const zoom = scale;
  viewport.style.transform = `translate(${-bounds.x * zoom}px, ${-bounds.y * zoom}px) scale(${zoom})`;

  clone.querySelectorAll<HTMLElement>(".fc-hint, .fc-restored, .fc-minimap, .fc-controls, .fc-empty, .fc-toast").forEach((element) => {
    element.style.display = "none";
  });
  clone.querySelectorAll<HTMLElement>(".fc-handle, .fc-hotspot-pin").forEach((element) => {
    element.style.display = "none";
  });

  stage.appendChild(clone);
  document.body.appendChild(stage);
  try {
    await waitForNextFrame();
    await document.fonts.ready;
    const dataUrl = await toPng(clone, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio,
      backgroundColor: background,
      cacheBust: true,
      skipAutoScale: false,
    });
    const blob = await toBlob(clone, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio,
      backgroundColor: background,
      cacheBust: true,
    });
    if (!blob) throw new Error("浏览器无法生成图片");
    return { dataUrl, width, height, blob };
  } finally {
    stage.remove();
  }
}

async function captureSvg(nodes: Node[], options: CanvasExportOptions): Promise<string> {
  if (!nodes.length) throw new Error("画布为空，没有可导出的内容");
  const bounds = getExportBounds(nodes, 48);
  const { toSvg } = await import("html-to-image");
  const liveCanvas = document.querySelector<HTMLElement>(".fc-canvas");
  if (!liveCanvas) throw new Error("找不到画布节点");
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const background = options.background ?? DEFAULT_BACKGROUND;

  const stage = document.createElement("div");
  stage.className = "fc-export-stage";
  stage.setAttribute("aria-hidden", "true");
  stage.style.position = "fixed";
  stage.style.left = "-100000px";
  stage.style.top = "0";
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.overflow = "hidden";
  stage.style.pointerEvents = "none";
  stage.style.background = background;

  const clone = liveCanvas.cloneNode(true) as HTMLElement;
  clone.classList.add("fc-export-clone");
  clone.style.position = "relative";
  clone.style.left = "auto";
  clone.style.top = "auto";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.overflow = "hidden";
  clone.style.background = background;

  const viewport = clone.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("找不到画布视口");
  viewport.style.transform = `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)`;
  clone.querySelectorAll<HTMLElement>(".fc-hint, .fc-restored, .fc-minimap, .fc-controls, .fc-empty, .fc-toast, .fc-handle, .fc-hotspot-pin").forEach((element) => {
    element.style.display = "none";
  });

  stage.appendChild(clone);
  document.body.appendChild(stage);
  try {
    await waitForNextFrame();
    await document.fonts.ready;
    return await toSvg(clone, {
      width,
      height,
      backgroundColor: background,
      cacheBust: true,
    });
  } finally {
    stage.remove();
  }
}

function svgDataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(",");
  if (!header || encoded === undefined) throw new Error("SVG 数据格式无效");
  const decoded = header.includes(";base64") ? atob(encoded) : decodeURIComponent(encoded);
  return new Blob([decoded], { type: "image/svg+xml;charset=utf-8" });
}

export async function exportCanvas(
  nodes: Node[],
  options: CanvasExportOptions,
): Promise<CanvasExportResult> {
  if (options.format === "svg") {
    options.onProgress?.("正在生成 SVG…");
    const dataUrl = await captureSvg(nodes, options);
    const blob = svgDataUrlToBlob(dataUrl);
    const filename = buildExportFilename(options.title ?? "FlowCraft-流程图", "svg");
    triggerBlobDownload(blob, filename);
    return { filename, bytes: blob.size, width: 0, height: 0 };
  }

  const capture = await captureCanvas(nodes, options);
  if (options.format === "png") {
    options.onProgress?.("正在下载 PNG…");
    const filename = buildExportFilename(options.title ?? "FlowCraft-流程图", "png");
    triggerBlobDownload(capture.blob, filename);
    return { filename, bytes: capture.blob.size, width: capture.width, height: capture.height };
  }

  options.onProgress?.("正在生成 PDF…");
  const image = new Image();
  image.src = capture.dataUrl;
  await image.decode();
  const pageWidth = 420;
  const pageHeight = 297;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [pageWidth, pageHeight], compress: true });
  const placement = computePdfPlacement(image.naturalWidth, image.naturalHeight, pageWidth, pageHeight, 10);
  pdf.addImage(capture.dataUrl, "PNG", placement.x, placement.y, placement.width, placement.height, undefined, "FAST");
  const filename = buildExportFilename(options.title ?? "FlowCraft-流程图", "pdf");
  pdf.save(filename);
  return {
    filename,
    bytes: pdf.output("arraybuffer").byteLength,
    width: capture.width,
    height: capture.height,
  };
}
