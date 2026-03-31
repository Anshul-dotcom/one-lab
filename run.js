#!/usr/bin/env node
/**
 * CLI — run reconciliation and print report to stdout.
 * Usage: node run.js [month]
 * Example: node run.js 2025-03
 */

'use strict';

const { reconcile, GAP_TYPES } = require('./engine');
const { TRANSACTIONS, SETTLEMENTS } = require('./seed');

const month = process.argv[2] || '2025-03';

const COLORS = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

const STATUS_COLOR = {
  [GAP_TYPES.MATCHED]:           COLORS.green,
  [GAP_TYPES.NEXT_MONTH_SETTLE]: COLORS.red,
  [GAP_TYPES.ROUNDING_DIFF]:     COLORS.yellow,
  [GAP_TYPES.DUPLICATE_ENTRY]:   COLORS.blue,
  [GAP_TYPES.ORPHAN_REFUND]:     COLORS.cyan,
  [GAP_TYPES.UNSETTLED]:         COLORS.red,
  [GAP_TYPES.AMOUNT_MISMATCH]:   COLORS.yellow,
};

function c(color, text) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function pad(s, n) {
  return String(s).padEnd(n);
}

function money(n) {
  if (n === null || n === undefined) return '—';
  return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
}

const report = reconcile(TRANSACTIONS, SETTLEMENTS, month);
const { summary, rows, gaps } = report;

console.log(`\n${c('bold', '══════════════════════════════════════════════════════')}`);
console.log(`${c('bold', '  PAYMENTS RECONCILIATION REPORT')}   ${c('gray', month)}`);
console.log(`${c('bold', '══════════════════════════════════════════════════════')}`);

console.log(`\n  ${c('bold', 'SUMMARY')}`);
console.log(`  ${c('gray', '──────────────────────────────────────────')}`);
console.log(`  Transactions processed : ${summary.total_transactions}`);
console.log(`  Total billed           : ${c('bold', money(summary.total_billed))}`);
console.log(`  Total settled          : ${c('green', money(summary.total_settled))}`);
console.log(`  Net variance           : ${c(summary.net_variance === 0 ? 'green' : 'red', money(summary.net_variance))}`);
console.log(`  Matched                : ${c('green', summary.matched_count)}`);
console.log(`  Gaps detected          : ${c(summary.gap_count > 0 ? 'red' : 'green', summary.gap_count)}`);

console.log(`\n  ${c('bold', 'ROW-LEVEL MATCH TABLE')}`);
console.log(`  ${c('gray', '──────────────────────────────────────────────────────────────────────')}`);
console.log(`  ${c('gray', pad('TXN ID',10))} ${pad('DATE',12)} ${pad('AMOUNT',10)} ${pad('SETTLEMENT',12)} ${pad('SETTLED',10)} ${pad('DELTA',8)} STATUS`);
console.log(`  ${c('gray', '──────────────────────────────────────────────────────────────────────')}`);

for (const row of rows) {
  const statusColor = STATUS_COLOR[row.status] || COLORS.reset;
  const date = row.txn_date.slice(0, 10);
  console.log(
    `  ${pad(row.txn_id, 10)} ${pad(date, 12)} ${pad(money(row.txn_amount), 10)} ` +
    `${pad(row.settlement_id || '—', 12)} ${pad(money(row.settled_amount), 10)} ` +
    `${pad(money(row.delta), 8)} ${statusColor}${row.status}${COLORS.reset}`
  );
}

console.log(`\n  ${c('bold', 'GAP DETAILS')}`);
console.log(`  ${c('gray', '──────────────────────────────────────────')}`);

if (gaps.length === 0) {
  console.log(`  ${c('green', 'No gaps — books balance.')}`);
} else {
  for (const gap of gaps) {
    const col = STATUS_COLOR[gap.gap_type] || COLORS.reset;
    console.log(`\n  ${col}[${gap.gap_type.toUpperCase()}]${COLORS.reset}  ${c('bold', gap.txn_id)}  ${money(gap.amount)}`);
    console.log(`  ${c('gray', gap.detail)}`);
  }
}

console.log(`\n  ${c('bold', 'ASSUMPTIONS')}`);
for (const a of report.assumptions) {
  console.log(`  ${c('gray', '·')} ${a}`);
}

console.log(`\n${c('gray', '  Generated: ' + report.generated_at)}\n`);
