// Loads daily BTC/USD prices in the browser: Coin Metrics first, Blockchain.com as backup,
// and a copy saved in this browser as a last resort. Returns [{ time: ms, price: number }].

const COINMETRICS_URL =
  "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics" +
  "?assets=btc&metrics=PriceUSD&frequency=1d&paging_from=start&page_size=10000";
const BLOCKCHAIN_URL =
  "https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false&cors=true";

const CACHE_KEY = "btc-prices-v1";
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

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(entry) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Storage full or blocked; the site still works without it.
  }
}

// Resolves to { prices, source, fetchedAt, stale }.
async function loadPrices() {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_FRESH_MS) {
    return { ...cached, stale: false };
  }

  const sources = [
    ["Coin Metrics", fetchCoinMetrics],
    ["Blockchain.com", fetchBlockchain],
  ];
  for (const [source, fetcher] of sources) {
    try {
      const prices = sortUnique(await fetcher());
      if (prices.length < 365) throw new Error(`${source} returned too little data`);
      const entry = { prices, source, fetchedAt: Date.now() };
      writeCache(entry);
      return { ...entry, stale: false };
    } catch (err) {
      console.warn(`Price source failed: ${source}`, err);
    }
  }

  if (cached) return { ...cached, stale: true };
  throw new Error("Couldn't load Bitcoin prices right now. Please try again in a bit.");
}

if (typeof module !== "undefined") {
  module.exports = { parseCoinMetrics, parseBlockchain, sortUnique };
}
