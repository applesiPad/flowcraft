/**
 * 首屏取景只允许在用户尚未接管画布时执行一次。
 * 用户点击“适应画布”后，挂载时延迟的 fitView 不应再覆盖新视图。
 */
export function createInitialViewportGuard() {
  let done = false;
  return {
    claim(): boolean {
      if (done) return false;
      done = true;
      return true;
    },
    reset(): void {
      done = false;
    },
  };
}