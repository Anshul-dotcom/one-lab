# Payments Reconciliation Engine
### Onelab AI Fitness Assessment Submission

---

## What this solves
A payments company's books don't balance at month-end. Every transaction their
platform processed should have a matching bank settlement. This engine finds
where the gaps are and classifies why.

---

## Files
```
recon/
├── index.html          ← Deployable dashboard (open in browser, no build needed)
├── run.js              ← CLI: prints coloured report to terminal
├── package.json
├── src/
│   └── engine.js       ← Core matching logic (pure JS, no dependencies)
├── data/
│   └── seed.js         ← Synthetic data with 4 planted gap types
└── tests/
    └── engine.test.js  ← 16 test cases, pure Node (no test framework needed)
```







