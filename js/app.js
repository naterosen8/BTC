// Wires the form to the DCA math and the live price loader.

const form = document.getElementById("dca-form");
const result = document.getElementById("result");
const sourceNote = document.getElementById("source");
const chartCard = document.getElementById("chart-card");
const chart = document.getElementById("chart");
const chartRows = document.getElementById("chart-rows");
const freqWord = document.getElementById("freq-word");
const FREQ_WORDS = { daily: "day", weekly: "week", monthly: "month" };
const compare = document.getElementById("compare");
const compareSummary = document.getElementById("compare-summary");
const compareRows = document.getElementById("compare-rows");
const goldSourceNote = document.getElementById("gold-source");
let prices = null;
let lastResult = null;
let gold = null; // { prices } once loaded, { error } if it failed

const usd = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const day = (ms) =>
  new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

// The period dropdown holds "5" (last 5 years), "since:2013", or "all".
function periodOptions(value) {
  if (value === "all") return { startTime: -Infinity };
  if (value.startsWith("since:")) return { startTime: Date.UTC(Number(value.slice(6)), 0, 1) };
  return { years: Number(value) };
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
    `Putting the same ${usd(g.invested)} into gold on the same days, you'd have ${usd(g.value)}. ` +
    `${leader} finished ${usd(Math.abs(diff))} ahead.`;
}

function drawCurrentChart() {
  if (lastResult) drawChart(chart, lastResult, prices[prices.length - 1].time);
}

function render() {
  freqWord.textContent = FREQ_WORDS[document.getElementById("frequency").value];
  if (!prices) return;
  const opts = {
    amount: Number(document.getElementById("amount").value),
    frequency: document.getElementById("frequency").value,
    feePct: Number(document.getElementById("fee").value) || 0,
    ...periodOptions(document.getElementById("period").value),
  };
  try {
    const r = simulateDca(prices, opts);
    const up = r.gain >= 0;
    result.innerHTML = `
      <p class="headline">You'd have put in <strong>${usd(r.invested)}</strong>,
      now worth <strong>${usd(r.value)}</strong>.</p>
      <dl class="stats">
        <div><dt>Gain / loss</dt><dd class="${up ? "up" : "down"}">${up ? "+" : ""}${usd(r.gain)} (${up ? "+" : ""}${Math.round(r.gainPct).toLocaleString("en-US")}%)</dd></div>
        <div><dt>Bitcoin owned</dt><dd>${r.btc.toLocaleString("en-US", { maximumFractionDigits: 6 })} BTC</dd></div>
        <div><dt>Purchases</dt><dd>${r.buys.length.toLocaleString("en-US")}</dd></div>
        <div><dt>First buy</dt><dd>${day(r.buys[0].time)}</dd></div>
      </dl>`;
    lastResult = r;
    renderCompare(r, opts);
    chartCard.hidden = false;
    drawCurrentChart();
    drawTable(chartRows, r, prices[prices.length - 1].time);
  } catch (err) {
    lastResult = null;
    chartCard.hidden = true;
    compare.hidden = true;
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
    sourceNote.textContent =
      `Daily prices from ${source}, ${day(prices[0].time)} to ${day(last.time)} ` +
      `(latest ${usd(last.price)}).` +
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
      `(latest ${usd(last.price)}/oz).` +
      (stale ? " Couldn't refresh just now, so these are saved prices." : "");
  })
  .catch((err) => {
    gold = { error: err.message };
  })
  .then(render);
