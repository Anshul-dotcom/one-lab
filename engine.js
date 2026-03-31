/**
 * Payments Reconciliation Engine
 * Onelab AI Fitness Assessment — Core matching logic
 *
 * ASSUMPTIONS:
 * 1. All amounts in USD, two decimal places.
 * 2. Reconciliation period = calendar month (configurable via MONTH param).
 * 3. Settlement T+1 or T+2 business days after transaction.
 * 4. A settlement dated after month-end is "next-month settle" for that transaction.
 * 5. Rounding diff = amounts differ by > $0.00 and <= $1.00 (bank truncation).
 * 6. Duplicate = same merchant_id + same amount + within 15 minutes + only one settlement found.
 * 7. Orphan refund = type === 'refund' with no matching original txn_id in dataset.
 * 8. Match priority: exact txn_id → txn_ref → amount+date fuzzy (fallback).
 */

'use strict';

const GAP_TYPES = {
  MATCHED: 'matched',
  NEXT_MONTH_SETTLE: 'next_month_settle',
  ROUNDING_DIFF: 'rounding_diff',
  DUPLICATE_ENTRY: 'duplicate_entry',
  ORPHAN_REFUND: 'orphan_refund',
  UNSETTLED: 'unsettled',
  AMOUNT_MISMATCH: 'amount_mismatch',
};

const ROUNDING_THRESHOLD = 1.00;      // flag if |delta| > 0 and <= this
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Main reconciliation function.
 * @param {Transaction[]} transactions  - platform ledger rows
 * @param {Settlement[]}  settlements   - bank statement rows
 * @param {string}        month         - "YYYY-MM" e.g. "2025-03"
 * @returns {ReconciliationReport}
 */
function reconcile(transactions, settlements, month) {
  const monthStart = new Date(`${month}-01T00:00:00`);
  const monthEnd   = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setMilliseconds(-1); // last ms of the month

  // Index settlements by txn_ref for O(1) lookup
  const settlementByRef = new Map();
  for (const s of settlements) {
    if (!settlementByRef.has(s.txn_ref)) settlementByRef.set(s.txn_ref, []);
    settlementByRef.get(s.txn_ref).push(s);
  }

  // Track which settlements have been consumed
  const consumedSettlements = new Set();

  const rows = [];

  // --- Pass 1: match each transaction ---
  for (const txn of transactions) {
    const txnDate = new Date(txn.datetime);

    // Out-of-period transactions are excluded
    if (txnDate < monthStart || txnDate > monthEnd) continue;

    const row = {
      txn_id: txn.txn_id,
      merchant: txn.merchant,
      txn_date: txn.datetime,
      txn_amount: txn.amount,
      type: txn.type,
      settlement_id: null,
      settled_date: null,
      settled_amount: null,
      delta: null,
      status: null,
      gap_detail: null,
    };

    // --- Orphan refund check ---
    if (txn.type === 'refund') {
      const originalExists = transactions.some(
        t => t.txn_id === txn.original_txn_id && t.type === 'charge'
      );
      if (!txn.original_txn_id || !originalExists) {
        row.status = GAP_TYPES.ORPHAN_REFUND;
        row.delta = txn.amount; // negative
        row.gap_detail = txn.original_txn_id
          ? `Refund references ${txn.original_txn_id} but original not found in current period`
          : 'Refund has no original_txn_id';
        rows.push(row);
        continue;
      }
    }

    // --- Find matching settlement ---
    const candidates = settlementByRef.get(txn.txn_id) || [];
    const available  = candidates.filter(s => !consumedSettlements.has(s.settlement_id));

    if (available.length === 0) {
      // No settlement found at all
      row.status = GAP_TYPES.UNSETTLED;
      row.delta  = txn.amount;
      row.gap_detail = 'No settlement found for this transaction';
      rows.push(row);
      continue;
    }

    const settlement = available[0];
    consumedSettlements.add(settlement.settlement_id);

    const settledDate = new Date(settlement.settled_date + 'T12:00:00');
    const delta = round2(txn.amount - settlement.amount);

    row.settlement_id  = settlement.settlement_id;
    row.settled_date   = settlement.settled_date;
    row.settled_amount = settlement.amount;
    row.delta          = delta;

    // --- Classify the match ---
    if (settledDate > monthEnd) {
      row.status = GAP_TYPES.NEXT_MONTH_SETTLE;
      row.gap_detail = `Transaction in ${month} but settled on ${settlement.settled_date} (after month-end)`;
    } else if (delta !== 0 && Math.abs(delta) <= ROUNDING_THRESHOLD) {
      row.status = GAP_TYPES.ROUNDING_DIFF;
      row.gap_detail = `Platform charged $${txn.amount.toFixed(2)}, bank settled $${settlement.amount.toFixed(2)}, delta $${delta.toFixed(2)}`;
    } else if (delta !== 0) {
      row.status = GAP_TYPES.AMOUNT_MISMATCH;
      row.gap_detail = `Amount mismatch: $${delta.toFixed(2)} variance`;
    } else {
      row.status = GAP_TYPES.MATCHED;
    }

    rows.push(row);
  }

  // --- Pass 2: duplicate detection ---
  // Group charges by merchant + amount, check for duplicates within window
  const chargeRows = rows.filter(r => r.type === 'charge' || r.type === undefined);
  for (let i = 0; i < chargeRows.length; i++) {
    for (let j = i + 1; j < chargeRows.length; j++) {
      const a = chargeRows[i];
      const b = chargeRows[j];
      if (a.merchant !== b.merchant) continue;
      if (a.txn_amount !== b.txn_amount) continue;
      const diff = Math.abs(new Date(a.txn_date) - new Date(b.txn_date));
      if (diff > DUPLICATE_WINDOW_MS) continue;
      // One of them has no settlement → it's the duplicate
      if (!a.settlement_id && a.status === GAP_TYPES.UNSETTLED) {
        a.status = GAP_TYPES.DUPLICATE_ENTRY;
        a.gap_detail = `Likely duplicate of ${b.txn_id} — same merchant, same amount $${a.txn_amount.toFixed(2)}, ${Math.round(diff/60000)} min apart`;
      } else if (!b.settlement_id && b.status === GAP_TYPES.UNSETTLED) {
        b.status = GAP_TYPES.DUPLICATE_ENTRY;
        b.gap_detail = `Likely duplicate of ${a.txn_id} — same merchant, same amount $${b.txn_amount.toFixed(2)}, ${Math.round(diff/60000)} min apart`;
      }
    }
  }

  // --- Metrics ---
  const totalBilled   = round2(transactions.filter(t => t.type === 'charge').reduce((s,t) => s + t.amount, 0));
  const totalRefunded = round2(Math.abs(transactions.filter(t => t.type === 'refund').reduce((s,t) => s + t.amount, 0)));
  const totalSettled  = round2(Array.from(consumedSettlements).reduce((s, sid) => {
    const set = settlements.find(x => x.settlement_id === sid);
    return s + (set ? set.amount : 0);
  }, 0));
  const gaps          = rows.filter(r => r.status !== GAP_TYPES.MATCHED);
  const netVariance   = round2(rows.filter(r => r.delta !== null).reduce((s,r) => s + (r.delta || 0), 0));

  return {
    month,
    generated_at: new Date().toISOString(),
    assumptions: [
      'All amounts USD, 2 decimal places',
      `Reconciliation period: ${month}-01 to ${month} month-end`,
      'Rounding diff threshold: $0.01–$1.00',
      'Duplicate detection window: 15 minutes',
      'Settlement must arrive by month-end to count for this period',
      'Orphan refund: type=refund with no matching original in current dataset',
    ],
    summary: {
      total_transactions: transactions.length,
      total_billed: totalBilled,
      total_refunded: totalRefunded,
      total_settled: totalSettled,
      net_variance: netVariance,
      matched_count:      rows.filter(r => r.status === GAP_TYPES.MATCHED).length,
      gap_count:          gaps.length,
    },
    gaps: gaps.map(g => ({
      txn_id:     g.txn_id,
      gap_type:   g.status,
      amount:     g.txn_amount,
      delta:      g.delta,
      detail:     g.gap_detail,
    })),
    rows,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { reconcile, GAP_TYPES, ROUNDING_THRESHOLD, DUPLICATE_WINDOW_MS };
