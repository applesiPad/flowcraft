export type ExportBounds = { x: number; y: number; width: number; height: number };
export type ExportViewport = { x: number; y: number; zoom: number };
export type PdfPlacement = { x: number; y: number; width: number; height: number };

/** 计算把整张流程图装进导出画布所需的 React Flow 视口 */
export function computeFitViewport(
  bounds: ExportBounds,
  width: number,
  height: number,
  options: { padding?: number; minZoom?: number; maxZoom?: number } = {},
): ExportViewport {
  const padding = Math.min(Math.max(options.padding ?? 0.06, 0), 0.45);
  const minZoom = options.minZoom ?? 0.05;
  const maxZoom = options.maxZoom ?? 2;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const availableWidth = width * (1 - padding * 2);
  const availableHeight = height * (1 - padding * 2);
  const zoom = Math.min(
    maxZoom,
    Math.max(minZoom, Math.min(availableWidth / bounds.width, availableHeight / bounds.height)),
  );
  return {
    x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

/** 按 contain 方式把图片放进 PDF 页面，保持原始比例 */
export function computePdfPlacement(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin = 12,
): PdfPlacement {
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    !Number.isFinite(pageWidth) ||
    !Number.isFinite(pageHeight) ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    return { x: margin, y: margin, width: 0, height: 0 };
  }
  const safeMargin = Math.max(0, Math.min(margin, pageWidth / 2 - 0.01, pageHeight / 2 - 0.01));
  const availableWidth = pageWidth - safeMargin * 2;
  const availableHeight = pageHeight - safeMargin * 2;
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** 生成跨平台安全的导出文件名 */
export function buildExportFilename(title: string, extension: string, now = new Date()): string {
  const safeTitle =
    title
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "flowcraft";
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const safeExtension = extension.replace(/^\./, "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${safeTitle}-${stamp}.${safeExtension}`;
}
