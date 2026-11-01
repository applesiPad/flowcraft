const task = await taskSpace("FlowCraft edge crossing diagnosis v2");
const page = task.page("p1");
try {
  await page.goto("http://localhost:5177/?example=ecommerce&t=" + Date.now());
  await page.waitForSelector(".react-flow__edge", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1000));
  const data = await page.evaluate(() => {
    const pathElements = Array.from(document.querySelectorAll(".react-flow__edge")).map((group) => {
      const el = Array.from(group.querySelectorAll("path")).find((p) => p.getAttribute("stroke") !== "transparent");
      return { id: group.getAttribute("data-id"), el };
    }).filter((x) => x.el);
    const samples = pathElements.map(({ id, el }) => {
      const length = el.getTotalLength();
      const count = Math.max(2, Math.min(180, Math.ceil(length / 5)));
      const points = Array.from({ length: count }, (_, i) => {
        const p = el.getPointAtLength((length * i) / (count - 1));
        return { x: p.x, y: p.y };
      });
      const bounds = points.reduce((box, p) => ({
        minX: Math.min(box.minX, p.x),
        maxX: Math.max(box.maxX, p.x),
        minY: Math.min(box.minY, p.y),
        maxY: Math.max(box.maxY, p.y),
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
      return { id, bounds, points };
    });
    const ccw = (a,b,c) => (c.y-a.y)*(b.x-a.x)-(b.y-a.y)*(b.x-a.x);
    const intersects = (a,b,c,d) => {
      const d1=ccw(a,b,c), d2=ccw(a,b,d), d3=ccw(c,d,a), d4=ccw(c,d,b);
      return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0));
    };
    const endpointDistance = (a,b) => {
      let min=Infinity;
      for (const p of [a.points[0], a.points[a.points.length-1]]) for (const q of [b.points[0], b.points[b.points.length-1]]) min=Math.min(min,Math.hypot(p.x-q.x,p.y-q.y));
      return min;
    };
    const crossings=[];
    for(let i=0;i<samples.length;i++) for(let j=i+1;j<samples.length;j++) {
      const a=samples[i], b=samples[j];
      if (a.bounds.maxX <= b.bounds.minX || b.bounds.maxX <= a.bounds.minX || a.bounds.maxY <= b.bounds.minY || b.bounds.maxY <= a.bounds.minY) continue;
      let count=0;
      for(let x=1;x<a.points.length;x++) for(let y=1;y<b.points.length;y++) if(intersects(a.points[x-1],a.points[x],b.points[y-1],b.points[y])) count++;
      if(count) crossings.push({a:a.id,b:b.id,segments:count,endpointDistance:Math.round(endpointDistance(a,b))});
    }
    return { crossings, crossingCount: crossings.length, distantCrossings: crossings.filter(x=>x.endpointDistance>60) };
  });
  console.log(JSON.stringify(data, null, 2));
} finally { await task.finish({ keep: [] }); }
