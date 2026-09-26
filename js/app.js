// Wires the form to the DCA math. Expects data/prices.json as [[timeMs, priceUsd], ...].

const form = document.getElementById("dca-form");
const result = document.getElementById("result");
let prices = null;

const usd = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function render() {
  if (!prices) return;
  const opts = {
    amount: Number(document.getElementById("amount").value),
    frequency: document.getElementById("frequency").value,
    years: Number(document.getElementById("years").value),
    feePct: Number(document.getElementById("fee").value) || 0,
  };
  try {
    const r = simulateDca(prices, opts);
    const up = r.gain >= 0;
    result.innerHTML = `
      <p class="headline">You'd have put in <strong>${usd(r.invested)}</strong>,
      now worth <strong>${usd(r.value)}</strong>.</p>
      <dl class="stats">
        <div><dt>Gain / loss</dt><dd class="${up ? "up" : "down"}">${up ? "+" : ""}${usd(r.gain)} (${r.gainPct.toFixed(0)}%)</dd></div>
        <div><dt>Bitcoin owned</dt><dd>${r.btc.toFixed(6)} BTC</dd></div>
        <div><dt>Purchases</dt><dd>${r.buys.length}</dd></div>
      </dl>`;
  } catch (err) {
    result.innerHTML = `<p class="status">${err.message}</p>`;
  }
}

form.addEventListener("input", render);

fetch("data/prices.json")
  .then((res) => {
    if (!res.ok) throw new Error(res.status);
    return res.json();
  })
  .then((rows) => {
    prices = rows.map(([time, price]) => ({ time, price }));
    render();
  })
  .catch(() => {
    result.innerHTML = `<p class="status">Price data isn't connected yet. That's the next step.</p>`;
  });
