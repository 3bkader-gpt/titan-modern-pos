/**
 * GL Deduplication & Legacy Float-Rounding Reconciliation (Stage 3)
 * 1. Removes ALL duplicate entries in general_ledger_2026 sharing (document_ref, account_name),
 *    keeping MIN(entry_id) (the original posting) and deleting all higher entry_ids.
 * 2. Reconciles tiny legacy VB6 single-precision (<f>) rounding deltas (<= 0.15 EGP per doc)
 *    so Modern POS checkLedgerIntegrity() starts at exact 0.00 EGP balance.
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.resolve('data', 'pharmacy.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const before = db.prepare(
  'SELECT COALESCE(SUM(debit),0) as d, COALESCE(SUM(credit),0) as c, COUNT(*) as n FROM general_ledger_2026'
).get();
console.log(
  `Before fix: entries=${before.n} debit=${before.d.toFixed(2)} credit=${before.c.toFixed(2)} diff=${(before.d - before.c).toFixed(2)}`
);

// Step 1: Delete ALL duplicate rows where entry_id > MIN(entry_id) for same (document_ref, account_name)
const dupes = db.prepare(`
  SELECT g.entry_id, g.document_ref, g.account_name, g.amount
  FROM general_ledger_2026 g
  WHERE g.entry_id > (
    SELECT MIN(g2.entry_id)
    FROM general_ledger_2026 g2
    WHERE g2.document_ref = g.document_ref AND g2.account_name = g.account_name
  )
  ORDER BY g.entry_id
`).all();

console.log(`Duplicate GL rows to remove: ${dupes.length}`);
if (dupes.length > 0) {
  const delStmt = db.prepare('DELETE FROM general_ledger_2026 WHERE entry_id = ?');
  const tx = db.transaction(() => {
    for (const d of dupes) {
      delStmt.run(d.entry_id);
      console.log(`  Deleted duplicate entry_id=${d.entry_id} (${d.document_ref} | ${d.account_name} | ${d.amount})`);
    }
  });
  tx();
}

// Step 2: Check per-document tiny VB6 <f> rounding residuals (<= 0.15 EGP)
const docDiffs = db.prepare(`
  SELECT document_ref,
         ROUND(SUM(debit) - SUM(credit), 2) as diff,
         COUNT(*) as cnt
  FROM general_ledger_2026
  GROUP BY document_ref
  HAVING ABS(ROUND(SUM(debit) - SUM(credit), 2)) > 0.001
`).all();

if (docDiffs.length > 0) {
  console.log('\nPer-document residuals after dedup:', docDiffs);
  const txRound = db.transaction(() => {
    for (const dd of docDiffs) {
      const absDiff = Math.abs(dd.diff);
      if (absDiff <= 0.15) {
        // Adjust the largest-magnitude leg of this legacy document by -dd.diff
        const leg = db.prepare(`
          SELECT entry_id, account_name, debit, credit, amount
          FROM general_ledger_2026
          WHERE document_ref = ?
          ORDER BY ABS(amount) DESC
          LIMIT 1
        `).get(dd.document_ref);
        if (leg) {
          let newDebit = leg.debit;
          let newCredit = leg.credit;
          if (newDebit > 0) {
            newDebit = Math.round((newDebit - dd.diff) * 100) / 100;
          } else {
            newCredit = Math.round((newCredit + dd.diff) * 100) / 100;
          }
          const newAmt = Math.round((newDebit - newCredit) * 100) / 100;
          db.prepare(
            'UPDATE general_ledger_2026 SET debit = ?, credit = ?, amount = ? WHERE entry_id = ?'
          ).run(newDebit, newCredit, newAmt, leg.entry_id);
          console.log(
            `  Reconciled legacy <f> rounding (${dd.diff.toFixed(2)} EGP) on ${dd.document_ref} entry_id=${leg.entry_id}`
          );
        }
      } else {
        console.warn(`  WARNING: Large imbalance (${dd.diff.toFixed(2)} EGP) on ${dd.document_ref} — left untouched!`);
      }
    }
  });
  txRound();
}

const after = db.prepare(
  'SELECT COALESCE(SUM(debit),0) as d, COALESCE(SUM(credit),0) as c, COUNT(*) as n FROM general_ledger_2026'
).get();
const remainingDiff = Math.round(Math.abs(after.d - after.c) * 100) / 100;
console.log(
  `\nAfter fix: entries=${after.n} debit=${after.d.toFixed(2)} credit=${after.c.toFixed(2)} diff=${remainingDiff.toFixed(2)}`
);

db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

if (remainingDiff > 0.05) {
  console.error(`ERROR: GL still unbalanced by ${remainingDiff.toFixed(2)} EGP!`);
  process.exit(1);
}
