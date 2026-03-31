/**
 * Test suite — payments reconciliation engine
 * Run with: node tests/engine.test.js
 * No test framework required — pure Node assertions.
 */

'use strict';

const assert  = require('assert');
const { reconcile, GAP_TYPES } = require('../src/engine');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗  ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

function makeCharge(overrides = {}) {
  return {
    txn_id: 'TXN-X',
    merchant: 'TestCo',
    datetime: '2025-03-15T10:00:00',
    amount: 100.00,
    type: 'charge',
    original_txn_id: null,
    ...overrides,
  };
}

function makeSettlement(overrides = {}) {
  return {
    settlement_id: 'SET-X',
    txn_ref: 'TXN-X',
    settled_date: '2025-03-17',
    amount: 100.00,
    ...overrides,
  };
}

// ─── NEXT-MONTH SETTLE ───────────────────────────────────────────────────────
console.log('\nNext-month settlement');

test('Transaction Mar 28, settlement Apr 01 → NEXT_MONTH_SETTLE', () => {
  const txns = [makeCharge({ txn_id: 'TXN-A', datetime: '2025-03-28T16:55:00', amount: 890 })];
  const sets  = [makeSettlement({ settlement_id: 'SET-A', txn_ref: 'TXN-A', settled_date: '2025-04-01', amount: 890 })];
  const r = reconcile(txns, sets, '2025-03');
  const row = r.rows.find(x => x.txn_id === 'TXN-A');
  assert.strictEqual(row.status, GAP_TYPES.NEXT_MONTH_SETTLE);
});

test('Transaction Mar 28, settlement Mar 30 → MATCHED', () => {
  const txns = [makeCharge({ txn_id: 'TXN-B', datetime: '2025-03-28T16:55:00', amount: 890 })];
  const sets  = [makeSettlement({ settlement_id: 'SET-B', txn_ref: 'TXN-B', settled_date: '2025-03-30', amount: 890 })];
  const r = reconcile(txns, sets, '2025-03');
  const row = r.rows.find(x => x.txn_id === 'TXN-B');
  assert.strictEqual(row.status, GAP_TYPES.MATCHED);
});

test('Transaction Apr 01 is excluded from March reconciliation', () => {
  const txns = [makeCharge({ txn_id: 'TXN-C', datetime: '2025-04-01T09:00:00', amount: 500 })];
  const sets  = [makeSettlement({ settlement_id: 'SET-C', txn_ref: 'TXN-C', settled_date: '2025-04-03', amount: 500 })];
  const r = reconcile(txns, sets, '2025-03');
  assert.strictEqual(r.rows.length, 0, 'April transaction should not appear in March report');
});

// ─── ROUNDING DIFF ───────────────────────────────────────────────────────────
console.log('\nRounding difference');

test('Platform $75.33, bank $75.00 → delta $0.33 → ROUNDING_DIFF', () => {
  const txns = [makeCharge({ txn_id: 'TXN-D', amount: 75.33 })];
  const sets  = [makeSettlement({ settlement_id: 'SET-D', txn_ref: 'TXN-D', amount: 75.00 })];
  const r = reconcile(txns, sets, '2025-03');
  const row = r.rows.find(x => x.txn_id === 'TXN-D');
  assert.strictEqual(row.status, GAP_TYPES.ROUNDING_DIFF);
  assert.strictEqual(row.delta, 0.33);
});

test('Platform $75.00, bank $75.00 → delta $0.00 → MATCHED', () => {
  const txns = [makeCharge({ txn_id: 'TXN-E', amount: 75.00 })];
  const sets  = [makeSettlement({ settlement_id: 'SET-E', txn_ref: 'TXN-E', amount: 75.00 })];
  const r = reconcile(txns, sets, '2025-03');
  assert.strictEqual(r.rows[0].status, GAP_TYPES.MATCHED);
});

test('Platform $100.00, bank $98.50 → delta $1.50 → AMOUNT_MISMATCH (not rounding)', () => {
  const txns = [makeCharge({ txn_id: 'TXN-F', amount: 100.00 })];
  const sets  = [makeSettlement({ settlement_id: 'SET-F', txn_ref: 'TXN-F', amount: 98.50 })];
  const r = reconcile(txns, sets, '2025-03');
  assert.strictEqual(r.rows[0].status, GAP_TYPES.AMOUNT_MISMATCH);
});

test('1000 × $0.33 rounding gap sums correctly in net_variance', () => {
  const txns = Array.from({ length: 10 }, (_, i) => makeCharge({ txn_id: `TXN-R${i}`, amount: 75.33 }));
  const sets  = txns.map((t, i) => makeSettlement({ settlement_id: `SET-R${i}`, txn_ref: t.txn_id, amount: 75.00 }));
  const r = reconcile(txns, sets, '2025-03');
  assert.strictEqual(Math.round(r.summary.net_variance * 100), Math.round(10 * 0.33 * 100));
});

// ─── DUPLICATE ENTRY ─────────────────────────────────────────────────────────
console.log('\nDuplicate entry');

test('Same merchant, same amount, 8 min apart, one settlement → second flagged DUPLICATE_ENTRY', () => {
  const txns = [
    makeCharge({ txn_id: 'TXN-G1', merchant: 'ZetaPay', datetime: '2025-03-14T10:05:00', amount: 4500 }),
    makeCharge({ txn_id: 'TXN-G2', merchant: 'ZetaPay', datetime: '2025-03-14T10:13:00', amount: 4500 }),
  ];
  const sets = [makeSettlement({ settlement_id: 'SET-G', txn_ref: 'TXN-G1', amount: 4500 })];
  const r = reconcile(txns, sets, '2025-03');
  const dup = r.rows.find(x => x.txn_id === 'TXN-G2');
  assert.strictEqual(dup.status, GAP_TYPES.DUPLICATE_ENTRY);
});

test('Same merchant, same amount, 8 min apart, two settlements → both MATCHED', () => {
  const txns = [
    makeCharge({ txn_id: 'TXN-H1', merchant: 'ZetaPay', datetime: '2025-03-14T10:05:00', amount: 4500 }),
    makeCharge({ txn_id: 'TXN-H2', merchant: 'ZetaPay', datetime: '2025-03-14T10:13:00', amount: 4500 }),
  ];
  const sets = [
    makeSettlement({ settlement_id: 'SET-H1', txn_ref: 'TXN-H1', amount: 4500 }),
    makeSettlement({ settlement_id: 'SET-H2', txn_ref: 'TXN-H2', amount: 4500 }),
  ];
  const r = reconcile(txns, sets, '2025-03');
  assert.strictEqual(r.rows[0].status, GAP_TYPES.MATCHED);
  assert.strictEqual(r.rows[1].status, GAP_TYPES.MATCHED);
});

test('Same merchant, same amount, 20 min apart → outside duplicate window, both treated independently', () => {
  const txns = [
    makeCharge({ txn_id: 'TXN-I1', merchant: 'ZetaPay', datetime: '2025-03-14T10:00:00', amount: 100 }),
    makeCharge({ txn_id: 'TXN-I2', merchant: 'ZetaPay', datetime: '2025-03-14T10:20:00', amount: 100 }),
  ];
  const sets = [makeSettlement({ settlement_id: 'SET-I', txn_ref: 'TXN-I1', amount: 100 })];
  const r = reconcile(txns, sets, '2025-03');
  const second = r.rows.find(x => x.txn_id === 'TXN-I2');
  // Should be UNSETTLED, not DUPLICATE_ENTRY
  assert.strictEqual(second.status, GAP_TYPES.UNSETTLED);
});

// ─── ORPHAN REFUND ────────────────────────────────────────────────────────────
console.log('\nOrphan refund');

test('Refund with original_txn_id = null → ORPHAN_REFUND', () => {
  const txns = [{ txn_id: 'REF-001', merchant: 'X', datetime: '2025-03-22T17:30:00', amount: -567, type: 'refund', original_txn_id: null }];
  const r = reconcile(txns, [], '2025-03');
  assert.strictEqual(r.rows[0].status, GAP_TYPES.ORPHAN_REFUND);
});

test('Refund referencing valid TXN in same dataset → MATCHED', () => {
  const txns = [
    makeCharge({ txn_id: 'TXN-J', amount: 200 }),
    { txn_id: 'REF-J', merchant: 'TestCo', datetime: '2025-03-20T10:00:00', amount: -200, type: 'refund', original_txn_id: 'TXN-J' },
  ];
  const sets = [
    makeSettlement({ settlement_id: 'SET-J', txn_ref: 'TXN-J', amount: 200 }),
  ];
  const r = reconcile(txns, sets, '2025-03');
  const refRow = r.rows.find(x => x.txn_id === 'REF-J');
  assert.notStrictEqual(refRow.status, GAP_TYPES.ORPHAN_REFUND, 'Refund with valid original should NOT be orphan');
});

test('Refund referencing prior-month TXN (not in dataset) → ORPHAN_REFUND', () => {
  const txns = [{ txn_id: 'REF-K', merchant: 'X', datetime: '2025-03-10T09:00:00', amount: -150, type: 'refund', original_txn_id: 'TXN-FEB-999' }];
  const r = reconcile(txns, [], '2025-03');
  assert.strictEqual(r.rows[0].status, GAP_TYPES.ORPHAN_REFUND);
  assert.ok(r.rows[0].gap_detail.includes('TXN-FEB-999'));
});

// ─── FULL DATASET INTEGRATION ─────────────────────────────────────────────────
console.log('\nFull dataset integration');

test('Running against seed data produces exactly 4 gaps', () => {
  const { TRANSACTIONS, SETTLEMENTS } = require('../data/seed');
  const r = reconcile(TRANSACTIONS, SETTLEMENTS, '2025-03');
  assert.strictEqual(r.summary.gap_count, 4, `Expected 4 gaps, got ${r.summary.gap_count}`);
});

test('Seed data contains exactly one of each gap type', () => {
  const { TRANSACTIONS, SETTLEMENTS } = require('../data/seed');
  const r = reconcile(TRANSACTIONS, SETTLEMENTS, '2025-03');
  const types = r.gaps.map(g => g.gap_type);
  assert.ok(types.includes(GAP_TYPES.NEXT_MONTH_SETTLE), 'Missing NEXT_MONTH_SETTLE');
  assert.ok(types.includes(GAP_TYPES.ROUNDING_DIFF), 'Missing ROUNDING_DIFF');
  assert.ok(types.includes(GAP_TYPES.DUPLICATE_ENTRY), 'Missing DUPLICATE_ENTRY');
  assert.ok(types.includes(GAP_TYPES.ORPHAN_REFUND), 'Missing ORPHAN_REFUND');
});

test('Net variance is non-zero in seed data', () => {
  const { TRANSACTIONS, SETTLEMENTS } = require('../data/seed');
  const r = reconcile(TRANSACTIONS, SETTLEMENTS, '2025-03');
  assert.notStrictEqual(r.summary.net_variance, 0);
});

// ─── RESULTS ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
