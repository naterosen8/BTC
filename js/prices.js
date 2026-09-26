// Loads daily prices in the browser, trying each source in order, with a copy saved in this
// browser as a last resort. Prices are [{ time: ms, price: number }].
// Bitcoin: Coin Metrics, then Blockchain.com. Gold: this site's /api/gold (see api/gold.js).

const COINMETRICS_URL =
  "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics" +
  "?assets=btc&metrics=PriceUSD&frequency=1d&paging_from=start&page_size=10000";
const BLOCKCHAIN_URL =
  "https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false&cors=true";

const GOLD_URL = "/api/gold";
const CACHE_FRESH_MS = 6 * 60 * 60 * 1000;

function parseCoinMetrics(json) {
  return (json.data || [])
    .map((row) => ({ time: Date.parse(row.time), price: Number(row.PriceUSD) }))
    .filter((p) => Number.isFinite(p.time) && p.price > 0);
}

function parseBlockchain(json) {
  return (json.values || [])
    .map((v) => ({ time: v.x * 1000, price: Number(v.y) }))
    .filter((p) => Number.isFinite(p.time) && p.price > 0);
}

function sortUnique(prices) {
  const byTime = new Map(prices.map((p) => [p.time, p]));
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

async function fetchCoinMetrics() {
  let url = COINMETRICS_URL;
  let all = [];
  // Full history fits in one page today; follow next_page_url in case it grows past that.
  for (let page = 0; url && page < 5; page++) {
    const json = await getJson(url);
    all = all.concat(parseCoinMetrics(json));
    url = json.next_page_url;
  }
  return all;
}

async function fetchBlockchain() {
  return parseBlockchain(await getJson(BLOCKCHAIN_URL));
}

async function fetchGold() {
  const json = await getJson(GOLD_URL);
  return { source: json.source, prices: json.prices.map(([time, price]) => ({ time, price })) };
}

function readCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeCache(key, entry) {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage full or blocked; the site still works without it.
  }
}

// Tries each [name, fetcher] in order. A fetcher returns prices, or { source, prices } to
// name its own source. Resolves to { prices, source, fetchedAt, stale }.
async function loadSeries(cacheKey, sources, label) {
  const cached = readCache(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_FRESH_MS) {
    return { ...cached, stale: false };
  }

  for (const [name, fetcher] of sources) {
    try {
      const got = await fetcher();
      const source = got.source || name;
      const prices = sortUnique(got.prices || got);
      if (prices.length < 365) throw new Error(`${source} returned too little data`);
      const entry = { prices, source, fetchedAt: Date.now() };
      writeCache(cacheKey, entry);
      return { ...entry, stale: false };
    } catch (err) {
      console.warn(`Price source failed: ${name}`, err);
    }
  }

  if (cached) return { ...cached, stale: true };
  throw new Error(`Couldn't load ${label} prices right now. Please try again in a bit.`);
}

function loadPrices() {
  return loadSeries("btc-prices-v1", [
    ["Coin Metrics", fetchCoinMetrics],
    ["Blockchain.com", fetchBlockchain],
  ], "Bitcoin");
}

function loadGoldPrices() {
  return loadSeries("gold-prices-v1", [["Gold", fetchGold]], "gold");
}

if (typeof module !== "undefined") {
  module.exports = { parseCoinMetrics, parseBlockchain, sortUnique };
}
