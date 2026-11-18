import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import {
  createSaleInvoice,
  checkCanEditSaleInvoice,
  getSaleInvoiceForEdit,
  updateSavedSaleInvoice,
  getInvoiceRevisions
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M3: Same-Day Unsave & Edit Sales Invoice (#N) ===');

  await withSandboxDb('m3', async (db) => {
    const sampleItems = db
      .prepare('SELECT item_id, item_name_en, consumer_price, buy_price, current_stock, package_units FROM items WHERE current_stock >= 5 AND consumer_price > 10 LIMIT 2')
      .all() as Array<{
        item_id: number;
        item_name_en: string;
        consumer_price: number;
        buy_price: number;
        current_stock: number;
        package_units: number;
      }>;
    assert.equal(sampleItems.length, 2, 'Expected 2 in-stock items for M3 verification');

    const [itemA, itemB] = sampleItems;
    const stockABefore = itemA.current_stock;
    const stockBBefore = itemB.current_stock;
    const cashBefore = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;

    // 1. Create cash invoice #N as cashier #4 (Esraa)
    const created = createSaleInvoice({
      user_id: 4,
      cashier_name: 'اسراء',
      discount: 0,
      payment_method: 'نقدي',
      items: [
        {
          item_id: itemA.item_id,
          item_name: itemA.item_name_en,
          quantity: 2,
          unit_type: 'pack',
          package_units: itemA.package_units || 1,
          unit_price: itemA.consumer_price,
          cost_price: itemA.buy_price || 0,
          discount_pct: 0,
          line_total: itemA.consumer_price * 2
        },
        {
          item_id: itemB.item_id,
          item_name: itemB.item_name_en,
          quantity: 1,
          unit_type: 'pack',
          package_units: itemB.package_units || 1,
          unit_price: itemB.consumer_price,
          cost_price: itemB.buy_price || 0,
          discount_pct: 0,
          line_total: itemB.consumer_price
        }
      ]
    });

    const invoiceNum = created.invoice_number;
    const oldNetTotal = created.total_selling_price - created.discount;
    const cashAfterCreate = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
    assert.equal(Math.round((cashAfterCreate - cashBefore) * 100) / 100, Math.round(oldNetTotal * 100) / 100);

    // 2. Check edit eligibility for owner vs another non-admin user
    const ownerCheck = checkCanEditSaleInvoice(invoiceNum, 4, 'CASHIER');
    assert.equal(ownerCheck.can_edit, true);
    assert.equal(ownerCheck.requires_manager_override, false);

    const otherCheck = checkCanEditSaleInvoice(invoiceNum, 3, 'PHARMACIST');
    assert.equal(otherCheck.can_edit, true);
    assert.equal(otherCheck.requires_manager_override, true);

    // Load editable payload
    const editable = getSaleInvoiceForEdit(invoiceNum);
    assert.ok(editable && editable.items.length === 2);

    // 3. Edit SAME invoice #N (remove itemB, keep 1x itemA, switch payment method from 'نقدي' to 'آجل')
    const edited = updateSavedSaleInvoice({
      invoice_number: invoiceNum,
      editor_user_id: 3,
      editor_user_name: 'شروق',
      editor_role: 'PHARMACIST',
      manager_override_pin: '1989',
      reason: 'حذف صنف وتحويل إلى آجل',
      discount: 0,
      payment_method: 'آجل',
      client_name: 'عميل تعديل نفس اليوم',
      items: [
        {
          item_id: itemA.item_id,
          item_name: itemA.item_name_en,
          quantity: 1,
          unit_type: 'pack',
          package_units: itemA.package_units || 1,
          unit_price: itemA.consumer_price,
          cost_price: itemA.buy_price || 0,
          discount_pct: 0,
          line_total: itemA.consumer_price
        }
      ]
    });

    // Invoice number #N MUST stay identical
    assert.equal(edited.invoice_number, invoiceNum);
    const invRow = db.prepare('SELECT edit_count, payment_method FROM sales_invoices WHERE invoice_number = ?').get(invoiceNum) as {
      edit_count: number;
      payment_method: string;
    };
    assert.equal(invRow.edit_count, 1);
    assert.equal(invRow.payment_method, 'آجل');

    // Treasury must have returned to exact pre-sale cash balance
    const cashAfterEdit = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
    assert.equal(cashAfterEdit, cashBefore, 'Treasury cash must return to pre-sale balance when switching from cash to credit');

    // Stocks: itemA deducted by 1 total; itemB fully restored
    const stockAAfter = (db.prepare('SELECT current_stock FROM items WHERE item_id = ?').get(itemA.item_id) as { current_stock: number }).current_stock;
    const stockBAfter = (db.prepare('SELECT current_stock FROM items WHERE item_id = ?').get(itemB.item_id) as { current_stock: number }).current_stock;
    assert.equal(Math.round((stockABefore - stockAAfter) * 10000) / 10000, 1);
    assert.equal(stockBAfter, stockBBefore);

    // Customer debt added
    const custRow = db.prepare("SELECT account_balance FROM customers WHERE customer_name = 'عميل تعديل نفس اليوم'").get() as { account_balance: number };
    assert.equal(custRow.account_balance, edited.total_selling_price);

    // Revision history logged
    const revisions = getInvoiceRevisions(invoiceNum);
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].old_payment_method, 'نقدي');
    assert.equal(revisions[0].new_payment_method, 'آجل');
    assert.equal(revisions[0].authorized_by_name, 'مدير الصيدلية');

    // 4. Negative check: yesterday/historical invoice cannot be edited
    const olderInv = db.prepare('SELECT invoice_number FROM sales_invoices ORDER BY invoice_number ASC LIMIT 1').get() as { invoice_number: number } | undefined;
    if (olderInv && olderInv.invoice_number !== invoiceNum) {
      const oldCheck = checkCanEditSaleInvoice(olderInv.invoice_number, 2, 'ADMIN');
      assert.equal(oldCheck.can_edit, false);
      assert.match(oldCheck.reason || '', /نفس اليوم/);
    }

    // 5. Negative check: drawer cash sufficiency guard
    const cashSale = createSaleInvoice({
      user_id: 2,
      cashier_name: 'مدير الصيدلية',
      discount: 0,
      payment_method: 'نقدي',
      items: [
        {
          item_id: itemB.item_id,
          item_name: itemB.item_name_en,
          quantity: 1,
          unit_type: 'pack',
          package_units: itemB.package_units || 1,
          unit_price: itemB.consumer_price,
          cost_price: itemB.buy_price || 0,
          discount_pct: 0,
          line_total: itemB.consumer_price
        }
      ]
    });

    // Simulate cash shortage in drawer in sandbox only
    const savedCash = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
    db.prepare('UPDATE treasury_state SET cash_balance = 1.0 WHERE id = 1').run();
    const lowCashCheck = checkCanEditSaleInvoice(cashSale.invoice_number, 2, 'ADMIN');
    assert.equal(lowCashCheck.can_edit, false);
    assert.match(lowCashCheck.reason || '', /نقدية كافية/);
    db.prepare('UPDATE treasury_state SET cash_balance = ? WHERE id = 1').run(savedCash);
  });

  console.log('[PASS] M3 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M3 verification failed:', err);
  process.exit(1);
});
