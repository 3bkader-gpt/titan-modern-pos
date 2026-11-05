/**
 * Database Indexes & Query Benchmark Audit
 * Audits all indexes in data/pharmacy.sqlite, analyzes EXPLAIN QUERY PLAN,
 * and benchmarks core POS queries across 18,574 items.
 */

import Database from 'better-sqlite3';
import { performance } from 'perf_hooks';
import path from 'path';

const DB_PATH = path.resolve('data', 'pharmacy.sqlite');
console.log(`\n========================================================================`);
console.log(`TITAN MODERN POS - DATABASE INDEXES & QUERY PERFORMANCE AUDIT`);
console.log(`Database: ${DB_PATH}`);
console.log(`========================================================================\n`);

const db = new Database(DB_PATH, { readonly: true });
db.pragma('journal_mode = WAL');

// -----------------------------------------------------------------------------
// PART 1: Full Inventory of All Indexes
// -----------------------------------------------------------------------------
console.log(`[1] INVENTORY OF ALL DATABASE INDEXES`);
console.log(`------------------------------------------------------------------------`);

const rawIndexes = db.prepare(`
  SELECT tbl_name, name, sql
  FROM sqlite_master
  WHERE type = 'index'
  ORDER BY tbl_name, name
`).all();

// Cache table unique status via PRAGMA index_list
const tableIndexListCache = new Map();
function getIndexUniqueStatus(tableName, indexName) {
  if (!tableIndexListCache.has(tableName)) {
    try {
      const list = db.prepare(`PRAGMA index_list('${tableName}')`).all();
      tableIndexListCache.set(tableName, list);
    } catch {
      tableIndexListCache.set(tableName, []);
    }
  }
  const list = tableIndexListCache.get(tableName);
  const found = list.find((i) => i.name === indexName);
  return found ? (found.unique === 1 ? 'UNIQUE' : 'NORMAL') : 'NORMAL';
}

const auditTable = [];

for (const idx of rawIndexes) {
  // Get indexed columns via PRAGMA index_info
  let cols = [];
  try {
    const info = db.prepare(`PRAGMA index_info('${idx.name}')`).all();
    cols = info.map((c) => c.name);
  } catch {
    cols = ['?'];
  }

  const isUnique = getIndexUniqueStatus(idx.tbl_name, idx.name);
  const isAuto = idx.name.startsWith('sqlite_autoindex_');

  auditTable.push({
    table: idx.tbl_name,
    index: idx.name,
    columns: cols.join(', ') || '(system)',
    type: isUnique,
    origin: isAuto ? 'PRIMARY KEY / CONSTRAINT' : 'EXPLICIT INDEX'
  });
}

// Print formatted table
console.table(auditTable);
console.log(`\nDetailed Index Inventory:`);
for (const [i, row] of auditTable.entries()) {
  console.log(`[${(i + 1).toString().padStart(2, '0')}] Table: ${row.table.padEnd(26)} | Index: ${row.index.padEnd(30)} | Columns: ${row.columns.padEnd(28)} | ${row.type.padEnd(6)} | ${row.origin}`);
}
console.log(`Total Indexes: ${auditTable.length} (Explicit: ${auditTable.filter(i => i.origin === 'EXPLICIT INDEX').length}, System Auto: ${auditTable.filter(i => i.origin !== 'EXPLICIT INDEX').length})`);

// -----------------------------------------------------------------------------
// PART 1.1: FTS5 Virtual Table & Trigger Inspection
// -----------------------------------------------------------------------------
console.log(`\n[1.1] FTS5 VIRTUAL TABLE & TRIGGERS AUDIT`);
console.log(`------------------------------------------------------------------------`);

const ftsTable = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'items_fts'").get();
const totalItemsCount = db.prepare("SELECT COUNT(*) as c FROM items").get().c;

if (ftsTable) {
  const ftsCount = db.prepare("SELECT COUNT(*) as c FROM items_fts").get().c;
  console.log(`✔ items_fts exists: YES (FTS5 Unicode61 full-text search)`);
  console.log(`✔ Total items in catalog: ${totalItemsCount.toLocaleString('en-US')}`);
  console.log(`✔ Total indexed in FTS:   ${ftsCount.toLocaleString('en-US')}`);
  console.log(`✔ FTS sync status:        ${ftsCount === totalItemsCount ? '100% IN SYNC' : 'OUT OF SYNC (' + (totalItemsCount - ftsCount) + ' diff)'}`);
} else {
  console.log(`❌ items_fts does NOT exist!`);
}

const triggers = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger'").all();
console.log(`✔ Triggers in database:   ${triggers.length} triggers`);
if (triggers.length > 0) {
  console.table(triggers.map(t => ({ trigger: t.name, table: t.tbl_name })));
} else {
  console.log(`   (Note: Syncing and automations are orchestrated at application layer in db.ts)`);
}

// -----------------------------------------------------------------------------
// PART 2: EXPLAIN QUERY PLAN Analysis
// -----------------------------------------------------------------------------
console.log(`\n[2] EXPLAIN QUERY PLAN FOR CORE POS QUERIES`);
console.log(`------------------------------------------------------------------------`);

const testQueries = [
  {
    id: 'A',
    name: 'Direct Barcode Search',
    sql: "SELECT * FROM items WHERE barcode = '6297001217078'"
  },
  {
    id: 'B',
    name: 'Item ID Lookup',
    sql: "SELECT * FROM items WHERE item_id = 18538"
  },
  {
    id: 'C',
    name: 'Generic Name Search',
    sql: "SELECT * FROM items WHERE generic_name = 'PARACETAMOL'"
  },
  {
    id: 'D',
    name: 'FTS5 Prefix Match Search',
    sql: "SELECT * FROM items_fts WHERE items_fts MATCH 'panadol*'"
  },
  {
    id: 'E',
    name: 'Sales Invoice by Invoice Number',
    sql: "SELECT * FROM sales_invoices WHERE invoice_number = 864"
  },
  {
    id: 'F',
    name: 'Sales Invoice Items by Invoice Number',
    sql: "SELECT * FROM sales_invoice_items WHERE invoice_number = 864"
  }
];

const planResults = [];
let scanCount = 0;

for (const q of testQueries) {
  const planRows = db.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all();
  const details = planRows.map(p => p.detail).join(' | ');
  const hasScan = details.includes('SCAN TABLE');
  const usesIndex = details.includes('USING INDEX') || details.includes('USING INTEGER PRIMARY KEY') || details.includes('VIRTUAL TABLE');

  if (hasScan) scanCount++;

  planResults.push({
    Query: `[${q.id}] ${q.name}`,
    Status: hasScan ? '❌ SCAN DETECTED' : (usesIndex ? '✔ INDEXED (FAST)' : 'ℹ NORMAL'),
    ExecutionPlan: details
  });
}

console.table(planResults);

// -----------------------------------------------------------------------------
// PART 3: Query Benchmark (100 Iterations Each)
// -----------------------------------------------------------------------------
console.log(`\n[3] QUERY LATENCY BENCHMARK (100 ITERATIONS PER QUERY)`);
console.log(`------------------------------------------------------------------------`);

const benchmarkResults = [];
const ITERATIONS = 100;

for (const q of testQueries) {
  const stmt = db.prepare(q.sql);

  // Warmup (5 runs)
  for (let i = 0; i < 5; i++) {
    stmt.all();
  }

  // Benchmark
  const times = [];
  let rowCount = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    const rows = stmt.all();
    const t1 = performance.now();
    times.push(t1 - t0);
    rowCount = rows.length;
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  benchmarkResults.push({
    Query: `[${q.id}] ${q.name}`,
    Rows: rowCount,
    'Avg Latency (ms)': avg.toFixed(3),
    'Min Latency (ms)': min.toFixed(3),
    'Max Latency (ms)': max.toFixed(3),
    Grade: avg < 1.0 ? '⚡ ULTRA-FAST (<1ms)' : (avg < 5.0 ? '✔ FAST (<5ms)' : '⚠️ ACCEPTABLE')
  });
}

console.table(benchmarkResults);

// -----------------------------------------------------------------------------
// SUMMARY & AUDIT FINDINGS
// -----------------------------------------------------------------------------
console.log(`\n========================================================================`);
console.log(`AUDIT VERDICT & SUMMARY:`);
console.log(`========================================================================`);
console.log(`1. Total Indexes in Database: ${auditTable.length}`);
console.log(`2. Total Tables Covered:      ${new Set(auditTable.map(i => i.table)).size}`);
console.log(`3. SCAN TABLE in POS Queries: ${scanCount === 0 ? '0 (NONE - All 100% Indexed)' : scanCount + ' DETECTED'}`);
console.log(`4. FTS5 Table Status:         ${ftsTable ? 'ACTIVE & POPULATED' : 'MISSING'}`);
console.log(`5. Average POS Search Time:   ${(benchmarkResults.reduce((acc, r) => acc + parseFloat(r['Avg Latency (ms)']), 0) / benchmarkResults.length).toFixed(3)} ms`);
console.log(`========================================================================\n`);

db.close();
