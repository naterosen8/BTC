// Vercel serverless function: GET /api/gold -> { source, prices: [[timeMs, priceUsd], ...] }
// Gold price sources don't allow browsers to fetch them directly, so this fetches server-side.
// Vercel's CDN caches the response, so the sources are hit a few times a day at most.

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=max&interval=1d";
const STOOQ_URL = "https://stooq.com/q/d/l/?s=xauusd&i=d";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; btc-dca-calculator)" };

// Yahoo Finance chart API, gold futures (continuous front month), daily closes.
function parseYahoo(json) {
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error("Unexpected Yahoo response");
  const closes = result.indicators.quote[0].close;
  return result.timestamp
    .map((t, i) => [t * 1000, closes[i]])
    .filter(([, price]) => typeof price === "number" && price > 0);
}

// Stooq CSV, spot gold: "Date,Open,High,Low,Close[,Volume]".
function parseStooq(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (!/^Date,/.test(lines[0])) throw new Error("Unexpected Stooq response");
  return lines.slice(1)
    .map((line) => {
      const cols = line.split(",");
      return [Date.parse(`${cols[0]}T00:00:00Z`), Number(cols[4])];
    })
    .filter(([time, price]) => Number.isFinite(time) && price > 0);
}

async function fetchChecked(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
}

const SOURCES = [
  ["Yahoo Finance (COMEX gold futures)", async () => parseYahoo(await (await fetchChecked(YAHOO_URL)).json())],
  ["Stooq (spot gold)", async () => parseStooq(await (await fetchChecked(STOOQ_URL)).text())],
];

async function handler(req, res) {
  for (const [source, load] of SOURCES) {
    try {
      const prices = await load();
      if (prices.length < 365) throw new Error(`${source} returned too little data`);
      prices.sort((a, b) => a[0] - b[0]);
      res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
      res.status(200).json({ source, prices });
      return;
    } catch (err) {
      console.warn(`Gold source failed: ${source}`, err);
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(502).json({ error: "Couldn't load gold prices right now." });
}

module.exports = handler;
module.exports.parseYahoo = parseYahoo;
module.exports.parseStooq = parseStooq;
