/**
 * GL Deduplication Fix
 * Removes duplicate entries in general_ledger_2026 that have the same
 * document_ref + account_name. Keeps the LOWER entry_id (the original),
 * removes the higher one (the duplicate posting).
 */
const Database = require('better-sqlite3');
const db = new Database('data/pharmacy.sqlite');

db.pragma('journal_mode = WAL');

// Preview duplicates
const dupes = db.prepare(`
  SELECT document_ref, account_name, COUNT(*) as cnt, MIN(entry_id) as keep_id, MAX(entry_id) as del_id,
         SUM(debit) as total_debit, SUM(credit) as total_credit
  FROM general_ledger_2026
  GROUP BY document_ref, account_name
  HAVING cnt > 1
  ORDER BY document_ref
`).all();

console.log("=== Duplicate GL entries to fix ===");
console.log(JSON.stringify(dupes, null, 2));
console.log("\nTotal duplicates:", dupes.length);

if (dupes.length === 0) {
  console.log("Nothing to fix.");
  db.close();
  process.exit(0);
}

// Verify balance before
const before = db.prepare("SELECT COALESCE(SUM(debit),0) as d, COALESCE(SUM(credit),0) as c, COUNT(*) as n FROM general_ledger_2026").get();
console.log(`\nBefore fix: entries=${before.n} debit=${before.d.toFixed(2)} credit=${before.c.toFixed(2)} diff=${(before.d - before.c).toFixed(2)}`);

// Delete the MAX entry_id (the duplicate) for each group
const deleteIds = dupes.map(d => d.del_id);
console.log("\nDeleting entry_ids:", deleteIds);

const tx = db.transaction(() => {
  for (const id of deleteIds) {
    const result = db.prepare("DELETE FROM general_ledger_2026 WHERE entry_id = ?").run(id);
    console.log(`  Deleted entry_id=${id}: changes=${result.changes}`);
  }
});
tx();

// Verify balance after
const after = db.prepare("SELECT COALESCE(SUM(debit),0) as d, COALESCE(SUM(credit),0) as c, COUNT(*) as n FROM general_ledger_2026").get();
console.log(`\nAfter fix: entries=${after.n} debit=${after.d.toFixed(2)} credit=${after.c.toFixed(2)} diff=${(after.d - after.c).toFixed(2)}`);

const remainingDiff = Math.abs(after.d - after.c);
if (remainingDiff < 1.0) {
  console.log("GL balance restored (diff=" + remainingDiff.toFixed(2) + " EGP - minor float rounding expected).");
} else {
  console.log("WARNING: Significant imbalance remains: " + remainingDiff.toFixed(2) + " EGP");
}

db.close();
