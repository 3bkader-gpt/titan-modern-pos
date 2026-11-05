const Database = require('better-sqlite3');
const db = new Database('data/pharmacy.sqlite', { readonly: true });

// TEST 1: Why no item with package_units >= 3 and stock >= 1?
const maxPkg = db.prepare("SELECT MAX(package_units) as mx, COUNT(*) as total FROM items").get();
console.log("Max package_units in DB:", maxPkg);

const items_dist = db.prepare("SELECT package_units, COUNT(*) as c FROM items GROUP BY package_units ORDER BY package_units DESC LIMIT 10").all();
console.log("package_units distribution:", JSON.stringify(items_dist));

const items_above2 = db.prepare("SELECT item_id, item_name_ar, package_units, current_stock, consumer_price FROM items WHERE package_units >= 2 ORDER BY package_units DESC LIMIT 15").all();
console.log("Items with pkg>=2:", JSON.stringify(items_above2, null, 2));

// TEST 3 imbalance investigation
const rows = db.prepare("SELECT * FROM general_ledger_2026 WHERE document_ref = 'AUTO-PURCHEASES-261004'").all();
console.log("\nGL entries for AUTO-PURCHEASES-261004:");
console.log(JSON.stringify(rows, null, 2));

db.close();
