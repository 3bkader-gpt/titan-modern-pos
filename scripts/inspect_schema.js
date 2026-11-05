const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/pharmacy.sqlite'));

const tables = [
  'sales_invoices',
  'sales_invoice_items',
  'items',
  'treasury_state',
  'general_ledger_2026',
  'delivery_orders',
  'shortages_drafts',
  'undo_sales_history',
  'customers'
];

for (const t of tables) {
  try {
    const info = db.prepare("PRAGMA table_info(" + t + ")").all();
    console.log('=== TABLE: ' + t + ' ===');
    if (info.length === 0) {
      console.log('DOES NOT EXIST');
    } else {
      console.log(info.map(c => c.name + ' (' + c.type + ')').join(', '));
      const sample = db.prepare("SELECT * FROM " + t + " LIMIT 1").get();
      if (sample) {
        console.log('Sample row:', JSON.stringify(sample));
      }
    }
  } catch(e) {
    console.log('Error inspecting ' + t + ':', e.message);
  }
}

// Also check all tables in the database
const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('=== ALL TABLES IN DB ===');
console.log(allTables.map(t => t.name).join(', '));
