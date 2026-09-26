// Draws "worth" vs. "put in" over time as an SVG line chart with a hover/keyboard crosshair,
// plus a yearly table of the same numbers. Expects a valueSeries() result.

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_POINTS = 400;
const HEIGHT = 280;
const M = { top: 16, right: 64, bottom: 28, left: 56 };

const compactUsd = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const fullUsd = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const shortDate = (ms) =>
  new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Thin the daily series to MAX_POINTS, always keeping the last (today's) point.
function chartPoints(series) {
  const step = Math.max(1, Math.ceil(series.length / MAX_POINTS));
  const pts = series.filter((_, i) => i % step === 0);
  if (pts[pts.length - 1] !== series[series.length - 1]) pts.push(series[series.length - 1]);
  return pts;
}

function niceStep(max, count) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

function yearTicks(t0, t1, maxTicks) {
  const y0 = new Date(t0).getUTCFullYear() + 1;
  const y1 = new Date(t1).getUTCFullYear();
  const every = Math.max(1, Math.ceil((y1 - y0 + 1) / maxTicks));
  const ticks = [];
  for (let y = y0; y <= y1; y += every) ticks.push(Date.UTC(y, 0, 1));
  return ticks;
}

function drawChart(container, series) {
  container.textContent = "";
  const pts = chartPoints(series);
  const final = series[series.length - 1];
  const width = Math.max(280, container.clientWidth);
  const w = width - M.left - M.right;
  const h = HEIGHT - M.top - M.bottom;

  const t0 = pts[0].time;
  const t1 = pts[pts.length - 1].time;
  const yMaxData = Math.max(...pts.map((p) => Math.max(p.value, p.invested)));
  const yStep = niceStep(yMaxData, 4);
  const yMax = Math.ceil(yMaxData / yStep) * yStep;
  const x = (t) => M.left + ((t - t0) / (t1 - t0 || 1)) * w;
  const y = (v) => M.top + h - (v / yMax) * h;

  const svg = el("svg", {
    width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`,
    class: "chart-svg", tabindex: 0, role: "img",
    "aria-label": `Line chart: put in ${fullUsd(final.invested)}, worth ends at ${fullUsd(final.value)}. Use arrow keys to step through dates.`,
  }, container);

  // Grid and axes.
  const grid = el("g", { class: "grid" }, svg);
  for (let v = 0; v <= yMax + yStep / 2; v += yStep) {
    el("line", { x1: M.left, x2: M.left + w, y1: y(v), y2: y(v) }, grid);
    el("text", { x: M.left - 8, y: y(v), "text-anchor": "end", "dominant-baseline": "middle", class: "tick" }, grid)
      .textContent = compactUsd(v);
  }
  for (const t of yearTicks(t0, t1, Math.max(2, Math.floor(w / 70)))) {
    el("text", { x: x(t), y: M.top + h + 20, "text-anchor": "middle", class: "tick" }, grid)
      .textContent = new Date(t).getUTCFullYear();
  }

  // Series: worth (area wash + line), then put in.
  const line = (key) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  el("path", { d: `${line("value")}L${x(t1)},${y(0)}L${x(t0)},${y(0)}Z`, class: "area-worth" }, svg);
  el("path", { d: line("invested"), class: "line line-invested" }, svg);
  el("path", { d: line("value"), class: "line line-worth" }, svg);

  // Direct end labels, only when they don't collide; the legend and tooltip cover the rest.
  const last = pts[pts.length - 1];
  const yw = y(last.value);
  const yi = y(last.invested);
  if (Math.abs(yw - yi) >= 16) {
    el("text", { x: x(t1) + 6, y: yw, "dominant-baseline": "middle", class: "end-label" }, svg).textContent = compactUsd(last.value);
    el("text", { x: x(t1) + 6, y: yi, "dominant-baseline": "middle", class: "end-label" }, svg).textContent = compactUsd(last.invested);
  }

  // Crosshair, dots, tooltip.
  const cross = el("g", { class: "cross", visibility: "hidden" }, svg);
  const vline = el("line", { y1: M.top, y2: M.top + h }, cross);
  const dotInv = el("circle", { r: 4, class: "dot dot-invested" }, cross);
  const dotWorth = el("circle", { r: 4, class: "dot dot-worth" }, cross);
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  container.appendChild(tip);

  function tipRow(cls, label, value) {
    const row = document.createElement("div");
    row.className = "tip-row";
    const key = document.createElement("span");
    key.className = `key ${cls}`;
    const strong = document.createElement("strong");
    strong.textContent = value;
    row.append(key, strong, ` ${label}`);
    return row;
  }

  let active = -1;
  function show(i) {
    active = Math.max(0, Math.min(pts.length - 1, i));
    const p = pts[active];
    const px = x(p.time);
    vline.setAttribute("x1", px);
    vline.setAttribute("x2", px);
    dotInv.setAttribute("cx", px);
    dotInv.setAttribute("cy", y(p.invested));
    dotWorth.setAttribute("cx", px);
    dotWorth.setAttribute("cy", y(p.value));
    cross.setAttribute("visibility", "visible");

    const date = document.createElement("div");
    date.className = "tip-date";
    date.textContent = shortDate(p.time);
    tip.replaceChildren(date, tipRow("key-worth", "worth", fullUsd(p.value)), tipRow("key-invested", "put in", fullUsd(p.invested)));
    tip.hidden = false;
    const left = px + 12 + tip.offsetWidth > width ? px - 12 - tip.offsetWidth : px + 12;
    tip.style.left = `${left}px`;
    tip.style.top = `${M.top}px`;
  }
  function hide() {
    active = -1;
    cross.setAttribute("visibility", "hidden");
    tip.hidden = true;
  }
  function nearest(clientX) {
    const tx = t0 + ((clientX - svg.getBoundingClientRect().left - M.left) / w) * (t1 - t0);
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].time < tx) lo = mid; else hi = mid;
    }
    return tx - pts[lo].time < pts[hi].time - tx ? lo : hi;
  }

  svg.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerdown", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    if (e.key === "Escape") return hide();
    if (!(e.key in moves)) return;
    e.preventDefault();
    const d = moves[e.key];
    show(Number.isFinite(d) ? (active < 0 ? pts.length - 1 : active + d) : d < 0 ? 0 : pts.length - 1);
  });
}

// One row per year (first day of each year in the series), plus today.
function drawTable(tbody, series) {
  const rows = [];
  let lastYear = null;
  for (const p of series) {
    const year = new Date(p.time).getUTCFullYear();
    if (year !== lastYear) {
      rows.push(p);
      lastYear = year;
    }
  }
  const final = series[series.length - 1];
  if (rows[rows.length - 1] !== final) rows.push(final);

  tbody.replaceChildren(...rows.map((p) => {
    const tr = document.createElement("tr");
    const label = p === final ? `${shortDate(p.time)} (latest)` : shortDate(p.time);
    for (const text of [label, fullUsd(p.invested), fullUsd(p.value), fullUsd(p.value - p.invested)]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    return tr;
  }));
}
