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

---

## Quick start
```bash
# Run the reconciliation report in terminal
node run.js

# Run all tests
node tests/engine.test.js

# View the dashboard
open index.html
```

---

## Gap types detected
| Gap | How it's planted | Root cause |
|-----|-----------------|------------|
| `next_month_settle` | TXN-003 (Mar 28) settles Apr 01 | Late-month txn, bank T+2 crosses month boundary |
| `rounding_diff` | TXN-005 charged $75.33, bank settles $75.00 | Bank truncates sub-cent amounts in batch |
| `duplicate_entry` | TXN-007 is TXN-006 re-submitted 8 min later | No idempotency key on charge creation |
| `orphan_refund` | REF-001 has original_txn_id = null | Foreign key not enforced on refunds |

---

## Assumptions
1. All amounts USD, two decimal places.
2. Reconciliation period = calendar month (configurable via CLI arg).
3. Settlement must arrive by month-end 23:59:59 to count for that period.
4. Rounding diff threshold: |delta| > $0.00 and ≤ $1.00.
5. Duplicate window: same merchant + same amount within 15 minutes + only one settlement.
6. Orphan refund: type = 'refund' with no matching original_txn_id in current period.

---

## What it would get wrong in production
1. **Multi-currency FX** — different spot rates per day create systematic sub-cent
   deltas that flood the rounding_diff bucket with false positives.
2. **Partial settlements** — banks split large ACH transfers across multiple batch
   runs; the 1:1 matcher flags both partials as unsettled.
3. **Hardcoded timing windows** — Visa T+1, Amex T+3, ACH next-business-day
   shifted by holidays; fixed 15-min duplicate window misfires on slow networks.

---

## Deliverables map
| Requirement | Where |
|-------------|-------|
| 1 Brainstorm thread | Tab "Brainstorm thread" in index.html |
| 2 Distilled prompt  | Tab "Distilled prompt" in index.html + below |
| 3 Claude Code thread| Tab "Brainstorm thread" (execution log embedded) |
| 4 Test cases        | tests/engine.test.js + Tab "Test cases" in index.html |
| 5 Working output    | index.html (deploy to any static host) + this zip |

---

## Distilled prompt (verbatim, for Claude Code / Cursor)
```
You are a payments reconciliation engine.

CONTEXT: A payments platform records transactions immediately when a customer
pays. A bank batches and settles funds 1–2 business days later. At month-end,
every transaction should have a matching settlement. Month: 2025-03.

TASK: Given transactions {txn_id, merchant, datetime, amount, type,
original_txn_id} and settlements {settlement_id, txn_ref, settled_date, amount},
produce a reconciliation report that:
1. Matches each transaction to its settlement via txn_id ↔ txn_ref.
2. Flags gaps as: NEXT_MONTH_SETTLE | ROUNDING_DIFF | DUPLICATE_ENTRY | ORPHAN_REFUND
3. Outputs summary metrics, row-level match table, gap list with detail + fix.

ASSUMPTIONS: rounding threshold $1.00, duplicate window 15 min, month boundary
23:59 month-end, orphan = refund with no valid original_txn_id in dataset.

Generate synthetic data with exactly one of each gap type. State all assumptions.
Return engine.js, seed.js, run.js, tests/engine.test.js.
```
