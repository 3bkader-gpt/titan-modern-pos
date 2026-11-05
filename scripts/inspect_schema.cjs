const Database = require('better-sqlite3');
const db = new Database('data/pharmacy.sqlite');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('=== TABLES ===');
console.log(tables.map(t=>t.name).join('\n'));

// Check items schema
const cols = db.prepare("PRAGMA table_info(items)").all();
console.log('\n--- items columns ---');
cols.forEach(c => console.log(`  ${c.name} (${c.type})`));

// Check work_shifts schema
const wsCols = db.prepare("PRAGMA table_info(work_shifts)").all();
console.log('\n--- work_shifts columns ---');
wsCols.forEach(c => console.log(`  ${c.name} (${c.type})`));

// Check shortages_drafts schema
const sdCols = db.prepare("PRAGMA table_info(shortages_drafts)").all();
console.log('\n--- shortages_drafts columns ---');
sdCols.forEach(c => console.log(`  ${c.name} (${c.type})`));

// Ledger tables
const gl = tables.filter(t => t.name.includes('ledger') || t.name.includes('general'));
console.log('\n--- ledger tables:', JSON.stringify(gl.map(t=>t.name)));

// If general_ledger exists
for (const lt of gl) {
  const glCols = db.prepare(`PRAGMA table_info(${lt.name})`).all();
  console.log(`\n--- ${lt.name} columns ---`);
  glCols.forEach(c => console.log(`  ${c.name} (${c.type})`));
  const sample = db.prepare(`SELECT * FROM ${lt.name} LIMIT 3`).all();
  console.log('  sample:', JSON.stringify(sample));
}

// Sample item with package_units
const item = db.prepare("SELECT id, name_ar, consumer_price, buy_price, package_units, current_stock FROM items WHERE package_units >= 3 LIMIT 5").all();
console.log('\n--- items with package_units>=3:');
console.log(JSON.stringify(item, null, 2));

// treasury_transactions
const tt = tables.find(t => t.name === 'treasury_transactions');
if (tt) {
  const ttCols = db.prepare("PRAGMA table_info(treasury_transactions)").all();
  console.log('\n--- treasury_transactions columns ---');
  ttCols.forEach(c => console.log(`  ${c.name} (${c.type})`));
}

db.close();
