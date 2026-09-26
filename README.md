# Bitcoin DCA Calculator

A simple, honest website that shows what buying a fixed dollar amount of Bitcoin on a schedule
(dollar-cost averaging) would have turned into, using real historical prices and including fees.

Plain HTML, CSS and JavaScript. No build step.

## Run it

```sh
python3 -m http.server 8000   # then open http://localhost:8000
node --test tests/*.test.js   # run the calculator tests
```

## Roadmap

1. [x] Page layout, calculator form, and tested DCA math
2. [x] Live daily prices since July 2010 (Coin Metrics, with Blockchain.com as backup)
3. [x] Chart of amount put in vs. what it was worth over time, with a table view
4. [ ] Explainer: what DCA is, its risks, and how fees and timing change results
5. [ ] Publish on GitHub Pages
