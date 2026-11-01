const task = await taskSpace("FlowCraft edge panel manual QA");
const page = task.page("p1");
const readState = () => page.evaluate(() => {
  const edge = document.querySelector('.react-flow__edge[data-id="e2"]');
  const main = edge ? Array.from(edge.querySelectorAll("path")).find((p) => p.getAttribute("stroke") !== "transparent") : null;
  const selects = Array.from(document.querySelectorAll("select"));
  const sourceSelect = selects.find((select) => Array.from(select.options).some((option) => option.value === "submit" || option.value === "send"));
  const routeSelect = selects.find((select) => Array.from(select.options).some((option) => option.value === "auto"));
  return {
    edgeSelected: !!edge?.getAttribute("class")?.includes("selected"),
    d: main?.getAttribute("d") ?? "",
    sourceValue: sourceSelect?.value ?? null,
    sourceOptions: sourceSelect ? Array.from(sourceSelect.options).map((option) => option.value) : [],
    routeValue: routeSelect?.value ?? null,
    routeOptions: routeSelect ? Array.from(routeSelect.options).map((option) => option.value) : [],
  };
});
const setSelect = async (kind, value) => {
  await page.evaluate(({ kind, value }) => {
    const selects = Array.from(document.querySelectorAll("select"));
    const select = kind === "route"
      ? selects.find((item) => Array.from(item.options).some((option) => option.value === "auto"))
      : selects.find((item) => Array.from(item.options).some((option) => option.value === "submit" || option.value === "send"));
    if (!select) throw new Error(kind + " select not found");
    select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, { kind, value });
  await new Promise((resolve) => setTimeout(resolve, 350));
};
try {
  await page.goto("http://localhost:5177/?example=ecommerce&t=" + Date.now());
  await page.waitForSelector(".react-flow__edge", { timeout: 10000 });
  await page.click('button[aria-label="适应画布"]', { label: "fit canvas" });
  await new Promise((resolve) => setTimeout(resolve, 800));
  const point = await page.evaluate(() => {
    const el = document.querySelector('.react-flow__edge[data-id="e2"] path[stroke="transparent"]');
    const p = el.getPointAtLength(el.getTotalLength() / 2);
    const screen = p.matrixTransform(el.getScreenCTM());
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y, { label: "select edge e2" });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const initial = await readState();
  await setSelect("source", initial.sourceValue === "submit" ? "send" : "submit");
  const sourceChanged = await readState();
  await page.click('button[aria-label="撤销"]', { label: "undo source change" });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const sourceUndone = await readState();
  await setSelect("route", "top");
  const routeTop = await readState();
  await page.click('button[aria-label="撤销"]', { label: "undo route change" });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const routeUndone = await readState();
  console.log(JSON.stringify({ initial, sourceChanged, sourceUndone, routeTop, routeUndone }, null, 2));
} finally {
  await task.finish({ keep: [] });
}
