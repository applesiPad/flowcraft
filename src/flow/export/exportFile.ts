export type TextFileExport = {
  filename: string;
  type: string;
  content: string;
};

/** 创建浏览器下载。同步失败时返回 false，由调用方给用户明确反馈。 */
export function exportTextFile(file: TextFileExport): boolean {
  let objectUrl: string | null = null;
  const link = document.createElement("a");
  try {
    const blob = new Blob([file.content], { type: file.type });
    objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = file.filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    return true;
  } catch {
    return false;
  } finally {
    link.remove();
    if (objectUrl !== null) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* 下载已触发时，清理失败不需要把成功改成失败。 */
      }
    }
  }
}
