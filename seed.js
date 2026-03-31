/**
 * Synthetic data generator for payments reconciliation assessment.
 * Plants exactly one of each required gap type:
 *   1. next_month_settle  — TXN-003 settles on Apr 01
 *   2. rounding_diff      — TXN-005 bank settles $0.33 less than charged
 *   3. duplicate_entry    — TXN-007 is a duplicate of TXN-006 (8 min apart, no settlement)
 *   4. orphan_refund      — REF-001 has no valid original_txn_id
 */

'use strict';

const TRANSACTIONS = [
  { txn_id: 'TXN-001', merchant: 'Acme Corp',     datetime: '2025-03-02T09:14:00', amount:  1200.00, type: 'charge',  original_txn_id: null },
  { txn_id: 'TXN-002', merchant: 'BetaCo',         datetime: '2025-03-05T11:32:00', amount:   340.99, type: 'charge',  original_txn_id: null },
  // GAP 1 — next month settle (settled Apr 01)
  { txn_id: 'TXN-003', merchant: 'Gamma Ltd',      datetime: '2025-03-28T16:55:00', amount:   890.00, type: 'charge',  original_txn_id: null },
  { txn_id: 'TXN-004', merchant: 'Delta Inc',       datetime: '2025-03-10T08:00:00', amount:  2150.00, type: 'charge',  original_txn_id: null },
  // GAP 2 — rounding diff ($75.33 charged, bank settles $75.00)
  { txn_id: 'TXN-005', merchant: 'EpsilonAI',      datetime: '2025-03-12T14:22:00', amount:    75.33, type: 'charge',  original_txn_id: null },
  // GAP 3 — duplicate (TXN-006 and TXN-007 same merchant, same amount, 8 min apart)
  { txn_id: 'TXN-006', merchant: 'Zeta Pay',        datetime: '2025-03-14T10:05:00', amount:  4500.00, type: 'charge',  original_txn_id: null },
  { txn_id: 'TXN-007', merchant: 'Zeta Pay',        datetime: '2025-03-14T10:13:00', amount:  4500.00, type: 'charge',  original_txn_id: null },
  { txn_id: 'TXN-008', merchant: 'Eta Works',       datetime: '2025-03-18T09:45:00', amount:   620.50, type: 'charge',  original_txn_id: null },
  { txn_id: 'TXN-009', merchant: 'Theta Labs',      datetime: '2025-03-20T13:00:00', amount:  3200.00, type: 'charge',  original_txn_id: null },
  // GAP 4 — orphan refund (original_txn_id is null / not in dataset)
  { txn_id: 'REF-001', merchant: 'Unknown',         datetime: '2025-03-22T17:30:00', amount:  -567.00, type: 'refund',  original_txn_id: null },
  { txn_id: 'TXN-010', merchant: 'Iota SaaS',       datetime: '2025-03-25T11:00:00', amount:   871.01, type: 'charge',  original_txn_id: null },
  { txn_id: 'TXN-011', merchant: 'Kappa Retail',    datetime: '2025-03-27T15:44:00', amount:   518.00, type: 'charge',  original_txn_id: null },
];

const SETTLEMENTS = [
  { settlement_id: 'SET-001', txn_ref: 'TXN-001', settled_date: '2025-03-04', amount: 1200.00 },
  { settlement_id: 'SET-002', txn_ref: 'TXN-002', settled_date: '2025-03-07', amount:  340.99 },
  { settlement_id: 'SET-003', txn_ref: 'TXN-004', settled_date: '2025-03-12', amount: 2150.00 },
  // GAP 2 — bank settles $75.00 not $75.33
  { settlement_id: 'SET-004', txn_ref: 'TXN-005', settled_date: '2025-03-14', amount:   75.00 },
  // GAP 3 — only ONE settlement for TXN-006 (TXN-007 is the duplicate with no settlement)
  { settlement_id: 'SET-005', txn_ref: 'TXN-006', settled_date: '2025-03-16', amount: 4500.00 },
  { settlement_id: 'SET-006', txn_ref: 'TXN-008', settled_date: '2025-03-20', amount:  620.50 },
  { settlement_id: 'SET-007', txn_ref: 'TXN-009', settled_date: '2025-03-22', amount: 3200.00 },
  { settlement_id: 'SET-008', txn_ref: 'TXN-010', settled_date: '2025-03-27', amount:  871.01 },
  // GAP 1 — TXN-003 settles April 01 (after month end)
  { settlement_id: 'SET-009', txn_ref: 'TXN-003', settled_date: '2025-04-01', amount:  890.00 },
  { settlement_id: 'SET-010', txn_ref: 'TXN-011', settled_date: '2025-03-29', amount:  518.00 },
];

module.exports = { TRANSACTIONS, SETTLEMENTS };
