const test = require("node:test");
const assert = require("node:assert");
const { priceAt, simulateDca, valueSeries, rideStats } = require("../js/dca.js");

const DAY = 24 * 60 * 60 * 1000;
const daily = (days, priceFn) =>
  Array.from({ length: days + 1 }, (_, i) => ({ time: i * DAY, price: priceFn(i) }));

test("priceAt returns the last price at or before a time", () => {
  const prices = [
    { time: 0, price: 1 },
    { time: 10, price: 2 },
    { time: 20, price: 3 },
  ];
  assert.strictEqual(priceAt(prices, 15).price, 2);
  assert.strictEqual(priceAt(prices, 20).price, 3);
  assert.strictEqual(priceAt(prices, -1), null);
});

test("flat price means value equals invested", () => {
  const r = simulateDca(daily(800, () => 100), { amount: 5, years: 1 });
  assert.strictEqual(r.buys.length, 53); // 365 days / 7, inclusive of both ends
  assert.strictEqual(r.invested, 265);
  assert.ok(Math.abs(r.value - r.invested) < 1e-9);
});

test("price doubling at the end doubles the value", () => {
  const prices = daily(800, (i) => (i === 800 ? 200 : 100));
  const r = simulateDca(prices, { amount: 10, years: 1, frequency: "monthly" });
  assert.ok(Math.abs(r.value - 2 * r.invested) < 1e-9);
});

test("fees reduce the BTC bought", () => {
  const prices = daily(800, () => 100);
  const r = simulateDca(prices, { amount: 100, years: 1, feePct: 1 });
  assert.ok(Math.abs(r.value - r.invested * 0.99) < 1e-9);
});

test("rejects periods longer than the data", () => {
  assert.throws(() => simulateDca(daily(100, () => 1), { amount: 5, years: 1 }), /Not enough/);
});

test("startTime runs from that date, clamped to the first price", () => {
  const prices = daily(800, () => 100);
  const r = simulateDca(prices, { amount: 5, startTime: 100 * DAY, frequency: "daily" });
  assert.strictEqual(r.buys.length, 701);
  const all = simulateDca(prices, { amount: 5, startTime: -Infinity, frequency: "daily" });
  assert.strictEqual(all.buys.length, 801);
});

test("endTime replays another asset on the same dates and values it then", () => {
  const btc = daily(800, () => 100);
  const gold = daily(900, (i) => (i <= 800 ? 10 : 50)); // gold has later prices than btc
  const a = simulateDca(btc, { amount: 5, years: 1 });
  const g = simulateDca(gold, { amount: 5, frequency: "weekly", startTime: a.startTime, endTime: a.endTime });
  assert.strictEqual(g.buys.length, a.buys.length);
  assert.strictEqual(g.invested, a.invested);
  assert.ok(Math.abs(g.value - g.invested) < 1e-9); // valued at day 800, before the jump
});

test("endTime mode refuses to start before the asset's history", () => {
  const gold = daily(100, () => 1);
  assert.throws(() => simulateDca(gold, { amount: 5, startTime: -DAY, endTime: 50 * DAY }), /Not enough/);
});

test("once buys a single time on the start date", () => {
  const prices = daily(800, (i) => 100 + i);
  const r = simulateDca(prices, { amount: 1000, frequency: "once", startTime: 100 * DAY });
  assert.strictEqual(r.buys.length, 1);
  assert.strictEqual(r.invested, 1000);
  assert.ok(Math.abs(r.units - 1000 / 200) < 1e-12);
  assert.ok(Math.abs(r.value - (1000 / 200) * 900) < 1e-9);
});

test("valueSeries tracks daily value between purchases and ends at the result", () => {
  const prices = daily(30, (i) => 10 + i);
  const r = simulateDca(prices, { amount: 10, frequency: "weekly", startTime: 0 });
  const s = valueSeries(prices, r);
  assert.strictEqual(s.length, 31);
  assert.strictEqual(s[3].invested, 10); // still only the first buy on day 3
  assert.ok(Math.abs(s[3].value - (10 / 10) * 13) < 1e-12);
  assert.strictEqual(s[7].invested, 20); // second buy lands on day 7
  const last = s[s.length - 1];
  assert.strictEqual(last.invested, r.invested);
  assert.ok(Math.abs(last.value - r.value) < 1e-9);
});

test("rideStats finds the biggest drop, the lowest point vs. put in, and time in profit", () => {
  const pt = (day, invested, value) => ({ time: day * DAY, invested, value });
  const series = [pt(0, 100, 100), pt(1, 100, 150), pt(2, 100, 60), pt(3, 100, 90), pt(4, 100, 200)];
  const s = rideStats(series);
  assert.ok(Math.abs(s.maxDrop.pct - -60) < 1e-9); // 150 -> 60
  assert.strictEqual(s.maxDrop.peak.time, 1 * DAY);
  assert.strictEqual(s.maxDrop.trough.time, 2 * DAY);
  assert.ok(Math.abs(s.lowest.pct - -40) < 1e-9); // worth 60 after putting in 100
  assert.strictEqual(s.lowest.point.time, 2 * DAY);
  assert.strictEqual(s.inProfitPct, 60); // days 0, 1, 4
});

test("rideStats on a stack that only went up", () => {
  const s = rideStats([{ time: 0, invested: 10, value: 10 }, { time: DAY, invested: 10, value: 12 }]);
  assert.strictEqual(s.maxDrop.pct, 0);
  assert.strictEqual(s.lowest.pct, 0);
  assert.strictEqual(s.inProfitPct, 100);
});

test("rideStats: new purchases after a high are not counted as recovery from a drop", () => {
  // Value falls from 200 to 150 while $100 more goes in; the drop is still measured on value.
  const s = rideStats([{ time: 0, invested: 100, value: 200 }, { time: DAY, invested: 200, value: 150 }]);
  assert.ok(Math.abs(s.maxDrop.pct - -25) < 1e-9);
  assert.ok(Math.abs(s.lowest.pct - -25) < 1e-9);
});
