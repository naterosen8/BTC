const test = require("node:test");
const assert = require("node:assert");
const { parseCoinMetrics, parseBlockchain, sortUnique } = require("../js/prices.js");

test("parses Coin Metrics rows and drops missing prices", () => {
  const prices = parseCoinMetrics({
    data: [
      { asset: "btc", time: "2010-07-18T00:00:00.000000000Z", PriceUSD: "0.0858" },
      { asset: "btc", time: "2010-07-19T00:00:00.000000000Z" },
    ],
  });
  assert.deepStrictEqual(prices, [{ time: Date.UTC(2010, 6, 18), price: 0.0858 }]);
});

test("parses Blockchain.com values and drops zero prices", () => {
  const prices = parseBlockchain({ values: [{ x: 1231459200, y: 0 }, { x: 1279411200, y: 0.09 }] });
  assert.deepStrictEqual(prices, [{ time: 1279411200000, price: 0.09 }]);
});

test("sortUnique orders by time and removes duplicate days", () => {
  const out = sortUnique([{ time: 2, price: 1 }, { time: 1, price: 1 }, { time: 2, price: 3 }]);
  assert.deepStrictEqual(out, [{ time: 1, price: 1 }, { time: 2, price: 3 }]);
});
