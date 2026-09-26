// Dollar-cost averaging math. Pure functions, no DOM, so it can be tested in Node.

const DAY_MS = 24 * 60 * 60 * 1000;

const FREQUENCY_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  once: Infinity, // a single purchase on the start date
};

// Returns the last price at or before `time`, or null if none.
// `prices` must be sorted by time ascending: [{ time: ms, price: number }].
function priceAt(prices, time) {
  let lo = 0;
  let hi = prices.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid].time <= time) {
      found = prices[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// Simulates buying `amount` dollars of an asset every `frequency`, valued at the end.
// The period is either the last `years`, or from `startTime` (ms), clamped to the first price.
// Pass `endTime` to value the stack on a set date instead of the latest price; this is how
// other assets are replayed on exactly the same purchase dates as Bitcoin.
// `feePct` is taken out of each purchase. `units` is the amount of the asset owned (BTC, oz...).
function simulateDca(prices, { amount, years, startTime, endTime, frequency = "weekly", feePct = 0 }) {
  if (!prices.length) throw new Error("No price data");
  if (!(amount > 0)) throw new Error("Amount must be positive");
  const stepDays = FREQUENCY_DAYS[frequency];
  if (!stepDays) throw new Error(`Unknown frequency: ${frequency}`);

  const last = prices[prices.length - 1];
  const end = endTime === undefined ? last : { time: endTime, price: (priceAt(prices, endTime) || {}).price };
  let start;
  if (startTime !== undefined) {
    if (endTime !== undefined && startTime < prices[0].time) {
      throw new Error("Not enough price history for that period");
    }
    start = Math.max(startTime, prices[0].time);
  } else {
    if (!(years > 0)) throw new Error("Years must be positive");
    start = end.time - years * 365 * DAY_MS;
    if (start < prices[0].time) throw new Error("Not enough price history for that period");
  }
  if (start > end.time) throw new Error("That start date is after the latest price");

  let invested = 0;
  let units = 0;
  const buys = [];
  for (let t = start; t <= end.time; t += stepDays * DAY_MS) {
    const p = priceAt(prices, t);
    invested += amount;
    units += (amount * (1 - feePct / 100)) / p.price;
    buys.push({ time: t, price: p.price, invested, units, value: units * p.price });
  }

  const value = units * end.price;
  return {
    invested,
    units,
    btc: units,
    value,
    gain: value - invested,
    gainPct: ((value - invested) / invested) * 100,
    startTime: start,
    endTime: end.time,
    buys,
  };
}

// Day-by-day holdings for a simulateDca() result: what had been put in, and what it was
// worth at each daily price, from the first purchase to the end. Used for the chart.
function valueSeries(prices, r) {
  const first = r.buys[0];
  const series = [{ time: first.time, invested: first.invested, value: first.value }];
  let b = 0;
  for (const p of prices) {
    if (p.time <= r.startTime) continue;
    if (p.time > r.endTime) break;
    while (b + 1 < r.buys.length && r.buys[b + 1].time <= p.time) b++;
    series.push({ time: p.time, invested: r.buys[b].invested, value: r.buys[b].units * p.price });
  }
  if (series[series.length - 1].time < r.endTime) {
    series.push({ time: r.endTime, invested: r.invested, value: r.value });
  }
  return series;
}

if (typeof module !== "undefined") {
  module.exports = { priceAt, simulateDca, valueSeries };
}
