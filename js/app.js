// Wires the form to the DCA math and the live price loader.

const form = document.getElementById("dca-form");
const result = document.getElementById("result");
const sourceNote = document.getElementById("source");
const chartCard = document.getElementById("chart-card");
const chart = document.getElementById("chart");
const chartRows = document.getElementById("chart-rows");
const headline = document.getElementById("headline");
const everyWord = document.getElementById("every-word");
const periodLabel = document.getElementById("period-label");
const dateLabel = document.getElementById("date-label");
const buyDate = document.getElementById("buy-date");
const FREQ_WORDS = { daily: "day", weekly: "week", monthly: "month" };
const compare = document.getElementById("compare");
const compareSummary = document.getElementById("compare-summary");
const compareRows = document.getElementById("compare-rows");
const goldSourceNote = document.getElementById("gold-source");
const ride = document.getElementById("ride");
const $ = (id) => document.getElementById(id);
let prices = null;
let lastResult = null;
let gold = null; // { prices } once loaded, { error } if it failed

const usd = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
// Per-coin prices: early Bitcoin traded for cents, so keep precision for small values.
const price = (n) =>
  n.toLocaleString("en-US", n < 1
    ? { style: "currency", currency: "USD", maximumSignificantDigits: 2 }
    : { style: "currency", currency: "USD", maximumFractionDigits: n < 100 ? 2 : 0 });
const day = (ms) =>
  new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

// The period dropdown holds "5" (last 5 years), "since:2013", or "all".
function periodOptions(value) {
  if (value === "all") return { startTime: -Infinity };
  if (value.startsWith("since:")) return { startTime: Date.UTC(Number(value.slice(6)), 0, 1) };
  return { years: Number(value) };
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Recurring buys use the period menu; a one-time buy uses the date picker instead.
function updateMode(frequency) {
  const once = frequency === "once";
  headline.textContent = once
    ? "What if you'd bought Bitcoin just once?"
    : `What if you'd bought a little Bitcoin every ${FREQ_WORDS[frequency]}?`;
  everyWord.hidden = once;
  periodLabel.hidden = once;
  dateLabel.hidden = !once;
}

function readOptions() {
  const frequency = document.getElementById("frequency").value;
  const opts = {
    amount: Number(document.getElementById("amount").value),
    frequency,
    feePct: Number(document.getElementById("fee").value) || 0,
  };
  if (frequency !== "once") return { ...opts, ...periodOptions(document.getElementById("period").value) };

  const time = Date.parse(`${buyDate.value}T00:00:00Z`);
  if (!Number.isFinite(time)) throw new Error("Pick the day you'd have bought.");
  if (time < prices[0].time) throw new Error(`Bitcoin prices start on ${day(prices[0].time)}. Pick a later day.`);
  return { ...opts, startTime: time };
}

const signedPct = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-US")}%`;

function compareRow(name, r) {
  const tr = document.createElement("tr");
  const gainTd = document.createElement("td");
  gainTd.className = r.gain >= 0 ? "up" : "down";
  gainTd.textContent = signedPct(r.gainPct);
  for (const text of [name, usd(r.value)]) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  }
  tr.appendChild(gainTd);
  return tr;
}

// Replays the same purchases (same dates, amounts and fee) in gold.
function renderCompare(btcResult, opts) {
  const once = opts.frequency === "once";
  compare.hidden = false;
  compareRows.replaceChildren(compareRow("Bitcoin", btcResult));
  if (!gold) {
    compareSummary.textContent = "Loading gold prices…";
    return;
  }
  if (gold.error) {
    compareSummary.textContent = gold.error;
    return;
  }
  let g;
  try {
    g = simulateDca(gold.prices, { ...opts, startTime: btcResult.startTime, endTime: btcResult.endTime });
  } catch (err) {
    compareSummary.textContent = "Gold price history doesn't cover this whole period.";
    return;
  }
  compareRows.appendChild(compareRow("Gold", g));
  const diff = btcResult.value - g.value;
  const leader = diff >= 0 ? "Bitcoin" : "Gold";
  compareSummary.textContent =
    `Putting the same ${usd(g.invested)} into gold on the same ${once ? "day" : "days"}, you'd have ${usd(g.value)}. ` +
    `${leader} finished ${usd(Math.abs(diff))} ahead.`;
}

// The biggest fall, the lowest point vs. money put in, and how often the stack was ahead.
function renderRide(series) {
  const { maxDrop, lowest, inProfitPct } = rideStats(series);
  ride.hidden = false;

  const drop = $("ride-drop");
  drop.className = `ride-value ${maxDrop.pct < 0 ? "down" : ""}`;
  drop.textContent = maxDrop.pct < 0 ? signedPct(maxDrop.pct) : "None";
  $("ride-drop-detail").textContent = maxDrop.pct < 0
    ? `From ${usd(maxDrop.peak.value)} on ${day(maxDrop.peak.time)} to ${usd(maxDrop.trough.value)} on ${day(maxDrop.trough.time)}.`
    : "It never fell below a previous high.";

  const low = $("ride-low");
  const under = lowest.pct < 0;
  low.className = `ride-value ${under ? "down" : "up"}`;
  low.textContent = under ? signedPct(lowest.pct) : "Never below";
  $("ride-low-detail").textContent = under
    ? `On ${day(lowest.point.time)} it was worth ${usd(lowest.point.value)} after you'd put in ${usd(lowest.point.invested)}.`
    : "It was never worth less than you'd put in.";

  $("ride-profit").className = "ride-value";
  $("ride-profit").textContent = `${Math.round(inProfitPct)}%`;
  const aheadDays = Math.round((inProfitPct / 100) * series.length);
  $("ride-profit-detail").textContent =
    `Worth at least what you'd put in on ${aheadDays.toLocaleString("en-US")} of ${series.length.toLocaleString("en-US")} days.`;
}

function drawCurrentChart() {
  if (lastResult) drawChart(chart, lastResult.series);
}

function render() {
  const frequency = document.getElementById("frequency").value;
  updateMode(frequency);
  if (!prices) return;
  try {
    const opts = readOptions();
    const r = simulateDca(prices, opts);
    const up = r.gain >= 0;
    const once = frequency === "once";
    const detail = once
      ? `<div><dt>Price then</dt><dd>${price(r.buys[0].price)}</dd></div>
        <div><dt>Price now</dt><dd>${price(prices[prices.length - 1].price)}</dd></div>`
      : `<div><dt>Purchases</dt><dd>${r.buys.length.toLocaleString("en-US")}</dd></div>
        <div><dt>First buy</dt><dd>${day(r.buys[0].time)}</dd></div>`;
    result.innerHTML = `
      <p class="headline">You'd have put in <strong>${usd(r.invested)}</strong>${once ? ` on ${day(r.startTime)}` : ""},
      now worth <strong>${usd(r.value)}</strong>.</p>
      <dl class="stats">
        <div><dt>Gain / loss</dt><dd class="${up ? "up" : "down"}">${up ? "+" : ""}${usd(r.gain)} (${signedPct(r.gainPct)})</dd></div>
        <div><dt>Bitcoin owned</dt><dd>${r.btc.toLocaleString("en-US", { maximumFractionDigits: 6 })} BTC</dd></div>
        ${detail}
      </dl>`;
    const series = valueSeries(prices, r);
    lastResult = { ...r, series };
    renderRide(series);
    renderCompare(r, opts);
    chartCard.hidden = false;
    drawCurrentChart();
    drawTable(chartRows, series);
  } catch (err) {
    lastResult = null;
    chartCard.hidden = true;
    compare.hidden = true;
    ride.hidden = true;
    result.innerHTML = `<p class="status">${err.message}</p>`;
  }
}

form.addEventListener("input", render);

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawCurrentChart, 100);
});

loadPrices()
  .then(({ prices: loaded, source, stale }) => {
    prices = loaded;
    const last = prices[prices.length - 1];
    buyDate.min = isoDay(prices[0].time);
    buyDate.max = isoDay(last.time);
    if (!buyDate.value) buyDate.value = isoDay(last.time - 5 * 365 * 864e5);
    sourceNote.textContent =
      `Daily prices from ${source}, ${day(prices[0].time)} to ${day(last.time)} ` +
      `(latest ${price(last.price)}).` +
      (stale ? " Couldn't refresh just now, so these are saved prices." : "");
    render();
  })
  .catch((err) => {
    result.innerHTML = `<p class="status">${err.message}</p>`;
  });

loadGoldPrices()
  .then(({ prices: loaded, source, stale }) => {
    gold = { prices: loaded };
    const last = loaded[loaded.length - 1];
    goldSourceNote.textContent =
      `Gold prices from ${source}, ${day(loaded[0].time)} to ${day(last.time)} ` +
      `(latest ${price(last.price)}/oz).` +
      (stale ? " Couldn't refresh just now, so these are saved prices." : "");
  })
  .catch((err) => {
    gold = { error: err.message };
  })
  .then(render);
