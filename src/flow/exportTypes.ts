import type { Node } from "@xyflow/react";

export type ExportFormat = "png" | "svg" | "pdf";
export type ExportProgress = (message: string) => void;

export type CanvasExportOptions = {
  format: ExportFormat;
  title?: string;
  /** 图片像素密度，PNG/PDF 使用；SVG 忽略。 */
  pixelRatio?: number;
  background?: string;
  onProgress?: ExportProgress;
};

export type CanvasExportResult = {
  filename: string;
  bytes: number;
  width: number;
  height: number;
};

/** 统一的画布导出器接口；具体 DOM 捕获逻辑在 exportCanvas.ts 实现。 */
export type CanvasExporter = {
  export(nodes: Node[], options: CanvasExportOptions): Promise<CanvasExportResult>;
};
