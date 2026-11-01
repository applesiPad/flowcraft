import assert from "node:assert/strict";
import test from "node:test";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  edgeMarkerColor,
  nextTheme,
  normalizeTheme,
  readTheme,
  type Theme,
} from "../src/flow/theme.ts";

test("主题默认浅色，仅明确存储 dark 才恢复深色", () => {
  assert.equal(normalizeTheme(undefined), "light");
  assert.equal(normalizeTheme(null), "light");
  assert.equal(normalizeTheme("system"), "light");
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(readTheme({ getItem: () => "dark" }), "dark");
  assert.equal(readTheme({ getItem: () => "light" }), "light");
});

test("localStorage 抛错时安全回退浅色", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readTheme(storage), "light");
});

test("主题切换在浅色和深色之间往返", () => {
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "light");
  assert.equal(nextTheme(nextTheme("light")), "light");
});

test("应用主题写入 data-theme 与 color-scheme", () => {
  const root = { dataset: {} as DOMStringMap, style: {} as CSSStyleDeclaration };
  applyTheme("dark", root);
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.style.colorScheme, "dark");
  applyTheme("light", root);
  assert.equal(root.dataset.theme, "light");
  assert.equal(root.style.colorScheme, "light");
});

test("箭头颜色随主题变化且两者不同", () => {
  const themes: Theme[] = ["light", "dark"];
  const colors = themes.map(edgeMarkerColor);
  assert.notEqual(colors[0], colors[1]);
  assert.match(colors[0], /^#[0-9a-f]{6}$/i);
  assert.match(colors[1], /^#[0-9a-f]{6}$/i);
});

test("主题存储键稳定，避免升级后丢失偏好", () => {
  assert.equal(THEME_STORAGE_KEY, "flowcraft.theme.v1");
});