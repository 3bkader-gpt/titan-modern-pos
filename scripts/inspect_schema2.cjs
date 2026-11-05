const Database = require('better-sqlite3');
const db = new Database('data/pharmacy.sqlite');

// treasury_state
const tsCols = db.prepare("PRAGMA table_info(treasury_state)").all();
console.log('--- treasury_state columns ---');
tsCols.forEach(c => console.log(`  ${c.name} (${c.type})`));
const tsData = db.prepare("SELECT * FROM treasury_state LIMIT 3").all();
console.log('  data:', JSON.stringify(tsData, null, 2));

// treasury_transactions  
const ttCols = db.prepare("PRAGMA table_info(treasury_transactions)").all();
console.log('\n--- treasury_transactions (may not exist) ---');
ttCols.forEach(c => console.log(`  ${c.name} (${c.type})`));

// sales_invoices columns
const siCols = db.prepare("PRAGMA table_info(sales_invoices)").all();
console.log('\n--- sales_invoices columns ---');
siCols.forEach(c => console.log(`  ${c.name} (${c.type})`));

// Check triggers
const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger'").all();
console.log('\n--- triggers ---');
triggers.forEach(t => console.log(`  ${t.name}`));

// sales_invoice_items columns
const siiCols = db.prepare("PRAGMA table_info(sales_invoice_items)").all();
console.log('\n--- sales_invoice_items columns ---');
siiCols.forEach(c => console.log(`  ${c.name} (${c.type})`));

db.close();
