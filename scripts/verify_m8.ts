import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import {
  updateItemStockThresholds,
  getSmartShortages,
  getItemVelocityAndBestSupplier,
  autoSuggestMinMaxFromSales,
  createPurchaseInvoice,
  createSaleInvoice,
  getSuppliers,
  saveSupplier
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M8: Smart Shortages, Sales Velocity & Best Historical Supplier ===');

  await withSandboxDb('m8', async (db) => {
    const targetItem = db
      .prepare('SELECT * FROM items WHERE current_stock >= 1 AND consumer_price >= 20 LIMIT 1')
      .get() as { item_id: number; item_name_en: string; consumer_price: number; current_stock: number; package_units: number } | undefined;
    assert.ok(targetItem, 'Expected at least 1 stocked item');

    // Prepare stock = 2, then set min_stock = 3, max_stock = 12
    db.prepare('UPDATE items SET current_stock = 2 WHERE item_id = ?').run(targetItem.item_id);
    const updatedItem = updateItemStockThresholds(targetItem.item_id, 3, 12, 1);
    assert.equal(updatedItem.min_stock, 3);
    assert.equal(updatedItem.max_stock, 12);

    // 1. Item below min_stock must automatically surface in getSmartShortages()
    const smartList = getSmartShortages({ limit: 300 });
    const foundBelowMin = smartList.find(s => s.item_id === targetItem.item_id);
    assert.ok(foundBelowMin, 'Expected item with stock=2 <= min_stock=3 to appear in smart shortages');
    assert.equal(foundBelowMin!.urgency, 'BELOW_MIN');
    assert.equal(foundBelowMin!.suggested_order_qty, 10, 'Expected max_stock(12) - stock(2) = 10 suggested qty');

    // 2. Two suppliers with different discounts: 18% (A) vs 25% (B)
    const suppliers = getSuppliers();
    const supA = suppliers.find(s => s.supplier_id > 1) || saveSupplier({ supplier_name: 'مخزن اختبار أ' });
    const supB = saveSupplier({ supplier_name: 'مخزن اختبار ب الأفضل' });
    const cp = targetItem.consumer_price;
    const costA = Math.round(cp * 0.82 * 100) / 100;
    const costB = Math.round(cp * 0.75 * 100) / 100;

    createPurchaseInvoice({
      supplier_id: supA.supplier_id,
      supplier_name: supA.supplier_name,
      paper_invoice_number: 'M8-SUP-A',
      payment_method: 'آجل',
      items: [{
        item_id: targetItem.item_id,
        item_name: targetItem.item_name_en,
        quantity: 2,
        bonus_quantity: 0,
        consumer_price: cp,
        discount_pct: 18,
        buy_price: costA,
        line_total: costA * 2
      }]
    });

    createPurchaseInvoice({
      supplier_id: supB.supplier_id,
      supplier_name: supB.supplier_name,
      paper_invoice_number: 'M8-SUP-B',
      payment_method: 'آجل',
      items: [{
        item_id: targetItem.item_id,
        item_name: targetItem.item_name_en,
        quantity: 3,
        bonus_quantity: 0,
        consumer_price: cp,
        discount_pct: 25,
        buy_price: costB,
        line_total: costB * 3
      }]
    });

    // Sell 6 packs to generate 30d sales velocity
    createSaleInvoice({
      items: [{
        item_id: targetItem.item_id,
        item_name: targetItem.item_name_en,
        quantity: 6,
        unit_type: 'pack',
        package_units: Math.max(1, targetItem.package_units || 1),
        unit_price: cp,
        cost_price: costB,
        discount_pct: 0,
        line_total: cp * 6
      }],
      payment_method: 'نقدي',
      discount: 0,
      discount_mode: 'AMOUNT',
      discount_input_value: 0,
      user_id: 99,
      cashier_name: 'د. مريم الحميلي'
    });

    const report = getItemVelocityAndBestSupplier(targetItem.item_id);
    assert.ok(report.sold_last_30d >= 6, `Expected sold_last_30d >= 6, got ${report.sold_last_30d}`);
    assert.ok(report.daily_velocity >= 0.2);
    assert.ok(report.best_supplier, 'Expected a best historical supplier');
    assert.equal(report.best_supplier!.supplier_id, supB.supplier_id, 'Expected Supplier B (25% discount) to beat Supplier A (18%)');
    assert.equal(report.best_supplier!.discount_pct, 25);

    const smartAfter = getSmartShortages({ supplierId: supB.supplier_id, limit: 200 });
    assert.ok(smartAfter.some(s => s.item_id === targetItem.item_id && s.best_supplier_id === supB.supplier_id));

    const autoRes = autoSuggestMinMaxFromSales(60);
    assert.ok(autoRes.updatedCount >= 1, 'Expected autoSuggestMinMaxFromSales to update active items');
  });

  console.log('[PASS] M8 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M8 verification failed:', err);
  process.exit(1);
});
