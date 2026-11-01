const task = await taskSpace("FlowCraft edge routing diagnosis");
const page = task.page("p1");
try {
  await page.goto("http://localhost:5177/?example=ecommerce&t=" + Date.now());
  await page.waitForSelector(".react-flow__edge", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1200));
  const data = await page.evaluate(() => {
    const edgeGroups = Array.from(document.querySelectorAll(".react-flow__edge"));
    const edges = edgeGroups.map((group) => {
      const id = group.getAttribute("data-id") ?? "";
      const paths = Array.from(group.querySelectorAll("path")).map((p) => ({
        d: p.getAttribute("d") ?? "",
        className: p.getAttribute("class") ?? "",
        strokeWidth: p.getAttribute("stroke-width") ?? "",
        visible: p.getAttribute("stroke") !== "transparent",
        length: p.getTotalLength?.() ?? 0,
      })).filter((p) => p.d);
      const main = paths.find((p) => p.visible) ?? paths[0];
      const first = main ? document.createElementNS("http://www.w3.org/2000/svg", "path") : null;
      if (first) first.setAttribute("d", main.d);
      const start = first ? first.getPointAtLength(0) : null;
      const end = first ? first.getPointAtLength(first.getTotalLength()) : null;
      const manhattan = start && end ? Math.abs(end.x - start.x) + Math.abs(end.y - start.y) : 0;
      return {
        id,
        pathCount: paths.length,
        visibleLength: main?.length ?? 0,
        manhattan,
        ratio: manhattan ? Number(((main?.length ?? 0) / manhattan).toFixed(2)) : null,
        d: main?.d ?? "",
      };
    });

    const pathElements = edgeGroups.map((group) => {
      const id = group.getAttribute("data-id") ?? "";
      const el = Array.from(group.querySelectorAll("path")).find((p) => p.getAttribute("stroke") !== "transparent");
      return { id, el };
    }).filter((x) => x.el);
    const samples = pathElements.map(({ id, el }) => {
      const length = el.getTotalLength();
      const count = Math.max(2, Math.min(160, Math.ceil(length / 6)));
      const points = Array.from({ length: count }, (_, i) => {
        const p = el.getPointAtLength((length * i) / (count - 1));
        return { x: p.x, y: p.y };
      });
      const bounds = points.reduce((box, point) => ({
        minX: Math.min(box.minX, point.x),
        maxX: Math.max(box.maxX, point.x),
        minY: Math.min(box.minY, point.y),
        maxY: Math.max(box.maxY, point.y),
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
      return { id, bounds, points };
    });
    const ccw = (a,b,c) => (c.y-a.y)*(b.x-a.x)-(b.y-a.y)*(b.x-a.x);
    const intersect = (a,b,c,d) => {
      const d1=ccw(a,b,c), d2=ccw(a,b,d), d3=ccw(c,d,a), d4=ccw(c,d,b);
      return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0));
    };
    const crossings=[];
    for(let i=0;i<samples.length;i++) for(let j=i+1;j<samples.length;j++) {
      const a=samples[i], b=samples[j];
      if (a.bounds.maxX <= b.bounds.minX || b.bounds.maxX <= a.bounds.minX || a.bounds.maxY <= b.bounds.minY || b.bounds.maxY <= a.bounds.minY) continue;
      let count=0;
      for(let x=1;x<a.points.length;x++) for(let y=1;y<b.points.length;y++) {
        if(intersect(a.points[x-1],a.points[x],b.points[y-1],b.points[y])) count++;
      }
      if(count) crossings.push({a:a.id,b:b.id,approxSegments:count});
    }

    return {
      viewport: { width: innerWidth, height: innerHeight },
      nodeCount: document.querySelectorAll(".react-flow__node").length,
      screenCount: document.querySelectorAll(".react-flow__node-screen").length,
      edgeCount: edgeGroups.length,
      edges,
      crossings,
      totalVisibleLength: edges.reduce((sum,e)=>sum+e.visibleLength,0),
      ratiosOver130: edges.filter(e=>e.ratio!==null&&e.ratio>1.3).map(e=>({id:e.id,ratio:e.ratio})),
    };
  });

  let screenshot = "not captured";
  try {
    const path = "C:/Users/32544/Desktop/画布/flowcraft/.ego-edge-routing-qa-20261101/ecommerce-current.png";
    await page.screenshot({ path, fullPage: false });
    screenshot = path;
  } catch (error) {
    screenshot = "not captured: " + error.message;
  }
  console.log(JSON.stringify({ ...data, screenshot }, null, 2));
} finally {
  await task.finish({ keep: [] });
}
