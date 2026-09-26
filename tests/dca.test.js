const test = require("node:test");
const assert = require("node:assert");
const { priceAt, simulateDca, valueSeries } = require("../js/dca.js");

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
