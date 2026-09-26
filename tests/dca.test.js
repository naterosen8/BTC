const test = require("node:test");
const assert = require("node:assert");
const { priceAt, simulateDca } = require("../js/dca.js");

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
