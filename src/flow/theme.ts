export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "flowcraft.theme.v1";
export const DARK_EDGE_MARKER = "#cbd5e1";
export const LIGHT_EDGE_MARKER = "#475569";

export function normalizeTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : "light";
}

export function readTheme(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): Theme {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}

export function edgeMarkerColor(theme: Theme): string {
  return theme === "dark" ? DARK_EDGE_MARKER : LIGHT_EDGE_MARKER;
}

export function applyTheme(theme: Theme, root: Pick<HTMLElement, "dataset" | "style"> | null = typeof document === "undefined" ? null : document.documentElement) {
  if (!root) return;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}