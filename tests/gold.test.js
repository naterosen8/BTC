const test = require("node:test");
const assert = require("node:assert");
const handler = require("../api/gold.js");
const { parseYahoo, parseStooq } = handler;

test("parses Yahoo chart JSON and drops missing closes", () => {
  const prices = parseYahoo({
    chart: { result: [{ timestamp: [100, 200, 300], indicators: { quote: [{ close: [1200.5, null, 1210] }] } }] },
  });
  assert.deepStrictEqual(prices, [[100000, 1200.5], [300000, 1210]]);
});

test("rejects Yahoo data that isn't daily", () => {
  const json = { chart: { result: [{ meta: { dataGranularity: "3mo" }, timestamp: [1], indicators: { quote: [{ close: [1] }] } }] } };
  assert.throws(() => parseYahoo(json), /3mo prices, not daily/);
});

test("handler asks Yahoo for an explicit daily period", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => { urls.push(url); return { ok: false, status: 500 }; });
  t.mock.method(console, "warn", () => {});
  await handler({}, { setHeader() {}, status() { return this; }, json() {} });
  assert.match(urls[0], /GC=F\?period1=946684800&period2=\d+&interval=1d$/);
});

test("parses Stooq CSV", () => {
  const prices = parseStooq("Date,Open,High,Low,Close\r\n2010-07-19,1,2,0.5,1190.5\r\n2010-07-20,1,2,0.5,1195\r\n");
  assert.deepStrictEqual(prices, [[Date.UTC(2010, 6, 19), 1190.5], [Date.UTC(2010, 6, 20), 1195]]);
});

test("rejects a Stooq error page", () => {
  assert.throws(() => parseStooq("<html>Exceeded the daily hits limit</html>"), /Unexpected/);
});

function fakeRes() {
  return {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  };
}

test("handler falls back to Stooq when Yahoo fails, and caches the result", async (t) => {
  const rows = Array.from({ length: 400 }, (_, i) => `${new Date(Date.UTC(2015, 0, 1) + i * 864e5).toISOString().slice(0, 10)},1,1,1,${1200 + i}`);
  t.mock.method(globalThis, "fetch", async (url) =>
    url.includes("yahoo")
      ? { ok: false, status: 429 }
      : { ok: true, text: async () => `Date,Open,High,Low,Close\n${rows.join("\n")}` });
  t.mock.method(console, "warn", () => {});
  const res = fakeRes();
  await handler({}, res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.source, "Stooq (spot gold)");
  assert.strictEqual(res.body.prices.length, 400);
  assert.match(res.headers["Cache-Control"], /s-maxage/);
});

test("handler returns 502 when every source fails", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 500 }));
  t.mock.method(console, "warn", () => {});
  const res = fakeRes();
  await handler({}, res);
  assert.strictEqual(res.code, 502);
  assert.strictEqual(res.body.failures.length, 3);
  assert.match(res.body.failures[0], /returned 500/);
});
