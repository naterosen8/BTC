// Dollar-cost averaging math. Pure functions, no DOM, so it can be tested in Node.

const DAY_MS = 24 * 60 * 60 * 1000;

const FREQUENCY_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
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

// Simulates buying `amount` dollars of BTC every `frequency`, ending at the most recent price.
// The period is either the last `years`, or from `startTime` (ms), clamped to the first price.
// `feePct` is taken out of each purchase.
function simulateDca(prices, { amount, years, startTime, frequency = "weekly", feePct = 0 }) {
  if (!prices.length) throw new Error("No price data");
  if (!(amount > 0)) throw new Error("Amount must be positive");
  const stepDays = FREQUENCY_DAYS[frequency];
  if (!stepDays) throw new Error(`Unknown frequency: ${frequency}`);

  const end = prices[prices.length - 1];
  let start;
  if (startTime !== undefined) {
    start = Math.max(startTime, prices[0].time);
  } else {
    if (!(years > 0)) throw new Error("Years must be positive");
    start = end.time - years * 365 * DAY_MS;
    if (start < prices[0].time) throw new Error("Not enough price history for that period");
  }
  if (start > end.time) throw new Error("That start date is after the latest price");

  let invested = 0;
  let btc = 0;
  const buys = [];
  for (let t = start; t <= end.time; t += stepDays * DAY_MS) {
    const p = priceAt(prices, t);
    invested += amount;
    btc += (amount * (1 - feePct / 100)) / p.price;
    buys.push({ time: t, price: p.price, invested, btc, value: btc * p.price });
  }

  const value = btc * end.price;
  return {
    invested,
    btc,
    value,
    gain: value - invested,
    gainPct: ((value - invested) / invested) * 100,
    buys,
  };
}

if (typeof module !== "undefined") {
  module.exports = { priceAt, simulateDca };
}
