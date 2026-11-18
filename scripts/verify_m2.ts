import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import {
  getSuppliers,
  getSupplierStatement,
  recordSupplierPayment,
  createPurchaseReturn,
  getPurchaseReturns,
  saveSupplier
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M2: Full Supplier System, Statement & Purchase/Expiry Returns ===');

  await withSandboxDb('m2', async (db) => {
    // 1. Verify legacy '.الكل' supplier payable entries are included in GL payable query
    const initialStmt = getSupplierStatement(4);
    assert.ok(
      initialStmt.total_gl_suppliers_payable >= 11855.8,
      `Expected total_gl_suppliers_payable >= 11855.80 (including legacy .الكل), got ${initialStmt.total_gl_suppliers_payable}`
    );

    const cashBeforePay = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
    const balanceBeforePay = initialStmt.closing_balance;

    // 2. Record 1000 EGP payment to supplier #4
    const payRes = recordSupplierPayment({
      supplier_id: 4,
      amount: 1000,
      notes: 'دفعة تحت الحساب',
      user_id: 2,
      cashier_name: 'مدير الصيدلية'
    });
    assert.equal(payRes.success, true);
    assert.equal(payRes.amount, 1000);
    assert.equal(Math.round((cashBeforePay - payRes.new_treasury_balance) * 100) / 100, 1000);

    const stmtAfterPay = getSupplierStatement(4);
    assert.equal(
      Math.round((balanceBeforePay - stmtAfterPay.closing_balance) * 100) / 100,
      1000,
      'Supplier statement closing balance must drop by 1000'
    );

    // 3. Ensure an in-stock item with >= 6 units exists in sandbox for return tests
    let targetItem = db
      .prepare('SELECT item_id, item_name_en, current_stock FROM items WHERE current_stock >= 6 LIMIT 1')
      .get() as { item_id: number; item_name_en: string; current_stock: number } | undefined;
    assert.ok(targetItem, 'Expected at least one in-stock item with current_stock >= 6');

    const stockBeforeReturn = targetItem.current_stock;

    // Expiry Return: totalCostValue = 5 * 100 = 500 EGP at 80% compensation (400 supplier credit + 100 expiry loss)
    const expReturn = createPurchaseReturn({
      supplier_id: 4,
      return_type: 'EXPIRY_RETURN',
      settlement_mode: 'SUPPLIER_CREDIT',
      compensation_pct: 80,
      notes: 'مرتجع إكسباير اختباري 80%',
      user_id: 2,
      cashier_name: 'مدير الصيدلية',
      items: [
        {
          item_id: targetItem.item_id,
          item_name: targetItem.item_name_en,
          quantity: 5,
          unit_cost: 100
        }
      ]
    });

    assert.equal(expReturn.total_cost_value, 500);
    assert.equal(expReturn.credit_amount, 400);
    assert.equal(expReturn.expiry_loss_amount, 100);

    const stockAfterReturn = (
      db.prepare('SELECT current_stock FROM items WHERE item_id = ?').get(targetItem.item_id) as { current_stock: number }
    ).current_stock;
    assert.equal(Math.round((stockBeforeReturn - stockAfterReturn) * 10000) / 10000, 5);

    // Check exact GL split for PUR-RET-<return_id>
    const glRows = db
      .prepare('SELECT account_name, debit, credit FROM general_ledger_2026 WHERE document_ref = ?')
      .all(`PUR-RET-${expReturn.return_id}`) as Array<{ account_name: string; debit: number; credit: number }>;

    const invCredit = glRows.find((r) => r.account_name === 'اصول.متداولة.مخزون')?.credit ?? 0;
    const supDebit = glRows.find((r) => r.account_name === 'خصوم.متداولة.موردين')?.debit ?? 0;
    const lossDebit = glRows.find((r) => r.account_name === 'مصروفات.تشغيلية.هوالك واكسباير')?.debit ?? 0;
    assert.equal(invCredit, 500);
    assert.equal(supDebit, 400);
    assert.equal(lossDebit, 100);

    // 4. Cash Refund purchase return of 1 unit @ 100 EGP
    const cashBeforeRefund = payRes.new_treasury_balance;
    const cashReturn = createPurchaseReturn({
      supplier_id: 4,
      return_type: 'PURCHASE_RETURN',
      settlement_mode: 'CASH_REFUND',
      compensation_pct: 100,
      items: [
        {
          item_id: targetItem.item_id,
          item_name: targetItem.item_name_en,
          quantity: 1,
          unit_cost: 100
        }
      ]
    });
    assert.equal(cashReturn.credit_amount, 100);
    const cashAfterRefund = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
    assert.equal(Math.round((cashAfterRefund - cashBeforeRefund) * 100) / 100, 100);

    // 5. Insufficient stock must throw cleanly
    assert.throws(
      () =>
        createPurchaseReturn({
          supplier_id: 4,
          return_type: 'PURCHASE_RETURN',
          settlement_mode: 'SUPPLIER_CREDIT',
          items: [
            {
              item_id: targetItem!.item_id,
              item_name: targetItem!.item_name_en,
              quantity: 999999,
              unit_cost: 10
            }
          ]
        }),
      /غير كافٍ/
    );

    // 6. Save extended supplier metadata & list returns
    const updatedSupplier = saveSupplier({
      supplier_id: 4,
      supplier_name: 'المتحدة للصيادلة',
      tax_id: 'TAX-400',
      address: 'القاهرة',
      credit_limit: 50000
    });
    assert.equal(updatedSupplier.tax_id, 'TAX-400');
    assert.ok(getSuppliers().length >= 18);
    assert.ok(getPurchaseReturns(4, 10).length >= 2);
  });

  console.log('[PASS] M2 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M2 verification failed:', err);
  process.exit(1);
});
