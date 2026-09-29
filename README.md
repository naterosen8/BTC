# Bitcoin DCA Calculator

A simple, honest website that shows what buying a fixed dollar amount of Bitcoin on a schedule
(dollar-cost averaging) would have turned into, using real historical prices and including fees.

Plain HTML, CSS and JavaScript. No build step. Bitcoin prices are fetched in the browser;
gold prices come through a small Vercel function (`api/gold.js`), because gold data sources
don't allow browsers to fetch them directly.

## Run it

```sh
python3 -m http.server 8000   # then open http://localhost:8000 (no gold: /api needs Vercel)
npx vercel dev                # full site including /api/gold
node --test tests/*.test.js   # run the calculator tests
```

## Roadmap

1. [x] Page layout, calculator form, and tested DCA math
2. [x] Live daily prices since July 2010 (Coin Metrics, with Blockchain.com as backup)
3. [x] Chart of amount put in vs. what it was worth over time, with a table view
4. [x] Same plan in gold, side by side (Yahoo Finance, with Stooq as backup)
5. [x] One-time purchase on any date
6. [x] How it felt along the way: biggest drop, lowest point vs. put in, days ahead
7. [ ] The dollar: cash saved, after inflation
8. [ ] More assets (S&P 500, ...) and a multi-line chart with a log-scale switch
9. [ ] Explainer: what DCA is, its risks, and how fees and timing change results
