import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/pharmacy.sqlite');
const db = new Database(dbPath);

db.prepare('DELETE FROM sales_invoice_items WHERE invoice_number > 864').run();
db.prepare('DELETE FROM sales_returns WHERE invoice_number > 864').run();
db.prepare('DELETE FROM undo_sales_history WHERE invoice_id > 864').run();
db.prepare('DELETE FROM delivery_orders WHERE invoice_number > 864').run();
db.prepare('DELETE FROM sales_invoices WHERE invoice_number > 864').run();
db.prepare("DELETE FROM customer_ledger WHERE notes LIKE '%فاتورة مبيعات آجل%' OR notes LIKE '%مرتجع مبيعات%' OR notes LIKE '%تجريبية%'").run();
db.prepare("DELETE FROM customers WHERE customer_name LIKE '%تجريبي%' OR customer_name LIKE '%تدقيق%'").run();
db.prepare('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id IN (312, 313)').run();
db.prepare('DELETE FROM purchases_invoices WHERE purchase_invoice_id IN (312, 313)').run();
db.prepare("DELETE FROM supplier_transactions WHERE notes LIKE '%للاختبار%'").run();
db.prepare("DELETE FROM general_ledger_2026 WHERE document_ref LIKE 'INV-%' AND CAST(SUBSTR(document_ref, 5) AS INTEGER) > 864").run();
db.prepare("DELETE FROM general_ledger_2026 WHERE document_ref LIKE 'RET-INV-%' AND CAST(SUBSTR(document_ref, 9) AS INTEGER) > 864").run();
db.prepare("DELETE FROM general_ledger_2026 WHERE document_ref LIKE 'PUR-31%'").run();
db.prepare("DELETE FROM general_ledger_2026 WHERE document_ref LIKE 'PAY-SUP%'").run();
db.prepare("DELETE FROM general_ledger_2026 WHERE document_ref LIKE 'PAY-CUST%'").run();
db.prepare("DELETE FROM general_ledger_2026 WHERE document_ref LIKE 'EXP-%' OR document_ref LIKE 'DEP-%' OR document_ref LIKE 'WTH-%'").run();
db.prepare('UPDATE treasury_state SET cash_balance = 119242.50 WHERE id = 1').run();

const gl = db.prepare('SELECT ROUND(SUM(debit), 2) as d, ROUND(SUM(credit), 2) as c FROM general_ledger_2026').get() as { d: number; c: number };
const maxInv = db.prepare('SELECT MAX(invoice_number) as m FROM sales_invoices').get() as { m: number };
const treasury = db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number };

console.log('Cleanup complete:');
console.log('  Max invoice:', maxInv.m);
console.log('  Treasury balance:', treasury.cash_balance);
console.log('  GL Debit:', gl.d, '| GL Credit:', gl.c, '| Diff:', Math.abs(gl.d - gl.c));
