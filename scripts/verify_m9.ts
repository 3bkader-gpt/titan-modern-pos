import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import {
  updateItemShelfLocation,
  getShelfItemsForStocktake,
  createAndPostStocktakeSession,
  getStocktakeSessions,
  getExpiryRiskReport,
  mergeDuplicateItems,
  runStockAndLedgerIntegrityAudit,
  saveOrUpdateItem,
  addItemBarcode,
  createSaleInvoice
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M9: Shelf Stocktake, Expiry Risk, Duplicate Merge & Integrity ===');

  await withSandboxDb('m9', async (db) => {
    const stockedItem = db
      .prepare('SELECT * FROM items WHERE current_stock >= 5 AND buy_price > 0 LIMIT 1')
      .get() as { item_id: number; item_name_en: string; current_stock: number; buy_price: number; consumer_price: number } | undefined;
    assert.ok(stockedItem, 'Expected stocked item with buy_price > 0');

    // 1. Shelf assignment & filter
    const shelved = updateItemShelfLocation(stockedItem.item_id, 'دولاب A - رف 2');
    assert.equal(shelved.shelf_location, 'دولاب A - رف 2');
    const shelfItems = getShelfItemsForStocktake('دولاب A');
    assert.ok(shelfItems.some(i => i.item_id === stockedItem.item_id));

    // 2. Shelf Stocktake with -2 deficit variance -> balanced GL posting
    const initialStock = stockedItem.current_stock;
    const countedQty = initialStock - 2;
    const stkRes = createAndPostStocktakeSession({
      scopeLabel: 'دولاب A - رف 2',
      userId: 99,
      userName: 'د. مريم الحميلي',
      lines: [{ itemId: stockedItem.item_id, countedQty }]
    });
    assert.equal(stkRes.total_variance_qty, -2);
    assert.equal(stkRes.gl_account, 'مصروفات.تشغيلية.عجز وتسويات جرد');

    const updatedAfterStk = db
      .prepare('SELECT current_stock FROM items WHERE item_id = ?')
      .get(stockedItem.item_id) as { current_stock: number };
    assert.equal(updatedAfterStk.current_stock, countedQty);

    const glDeficitRow = db
      .prepare("SELECT * FROM general_ledger_2026 WHERE document_ref = ? AND account_name = 'مصروفات.تشغيلية.عجز وتسويات جرد'")
      .get(`STK-${stkRes.session_id}`) as { debit: number; credit: number } | undefined;
    assert.ok(glDeficitRow && glDeficitRow.debit > 0 && glDeficitRow.credit === 0);

    const sessions = getStocktakeSessions(10);
    assert.ok(sessions.some(s => s.session_id === stkRes.session_id && s.status === 'POSTED'));

    // 3. Duplicate merge: primary + duplicate with 2 sales lines & extra barcode
    const primaryItem = saveOrUpdateItem({
      item_name_en: 'TEST MERGE PRIMARY DRUG',
      consumer_price: 80,
      buy_price: 60,
      package_units: 1,
      current_stock: 5
    });
    const dupItem = saveOrUpdateItem({
      item_name_en: 'TEST MERGE DUP DRUG',
      barcode: '6225551112223',
      consumer_price: 80,
      buy_price: 60,
      package_units: 1,
      current_stock: 3
    });
    addItemBarcode(dupItem.item_id, '6225559990001', 'باركود فرعي مكرر');

    const sale1 = createSaleInvoice({
      items: [{
        item_id: dupItem.item_id,
        item_name: dupItem.item_name_en,
        quantity: 1,
        unit_type: 'pack',
        package_units: 1,
        unit_price: 80,
        cost_price: 60,
        discount_pct: 0,
        line_total: 80
      }],
      payment_method: 'نقدي',
      discount: 0,
      user_id: 99,
      cashier_name: 'د. مريم الحميلي'
    });
    const sale2 = createSaleInvoice({
      items: [{
        item_id: dupItem.item_id,
        item_name: dupItem.item_name_en,
        quantity: 1,
        unit_type: 'pack',
        package_units: 1,
        unit_price: 80,
        cost_price: 60,
        discount_pct: 0,
        line_total: 80
      }],
      payment_method: 'نقدي',
      discount: 0,
      user_id: 99,
      cashier_name: 'د. مريم الحميلي'
    });

    // Duplicate now has 3 - 2 = 1 remaining stock
    const mergeRes = mergeDuplicateItems(primaryItem.item_id, dupItem.item_id, 'د. مريم الحميلي');
    assert.equal(mergeRes.moved_stock, 1);
    assert.equal(mergeRes.sales_lines_moved, 2);
    assert.ok(mergeRes.barcodes_moved >= 1);

    const primaryAfterMerge = db
      .prepare('SELECT current_stock FROM items WHERE item_id = ?')
      .get(primaryItem.item_id) as { current_stock: number };
    assert.equal(primaryAfterMerge.current_stock, 6);

    const dupExists = db.prepare('SELECT item_id FROM items WHERE item_id = ?').get(dupItem.item_id);
    assert.equal(dupExists, undefined, 'Duplicate item must be deleted after merge');

    const movedSalesLines = (
      db.prepare('SELECT COUNT(*) as c FROM sales_invoice_items WHERE item_id = ? AND invoice_number IN (?, ?)').get(
        primaryItem.item_id,
        sale1.invoice_number,
        sale2.invoice_number
      ) as { c: number }
    ).c;
    assert.equal(movedSalesLines, 2, 'All 2 sales lines must point to primary_item_id');

    const movedBc = db
      .prepare('SELECT item_id FROM item_barcodes WHERE barcode = ?')
      .get('6225559990001') as { item_id: number } | undefined;
    assert.equal(movedBc?.item_id, primaryItem.item_id);

    const mergeLogRow = db
      .prepare('SELECT * FROM item_merge_log WHERE primary_item_id = ? AND duplicate_item_id = ?')
      .get(primaryItem.item_id, dupItem.item_id);
    assert.ok(mergeLogRow, 'Expected audit log in item_merge_log');

    // 4. Velocity expiry risk & Integrity Audit
    const futureExpDate = new Date();
    futureExpDate.setMonth(futureExpDate.getMonth() + 2);
    const expStr = `${String(futureExpDate.getMonth() + 1).padStart(2, '0')}-${futureExpDate.getFullYear()}`;
    db.prepare('UPDATE items SET expiry_date = ? WHERE item_id = ?').run(expStr, primaryItem.item_id);

    const riskRows = getExpiryRiskReport(6);
    assert.ok(riskRows.some(r => r.item_id === primaryItem.item_id && r.at_risk_cost_egp > 0));

    const auditReport = runStockAndLedgerIntegrityAudit();
    assert.equal(auditReport.gl_integrity.balanced, true);
    assert.equal(auditReport.gl_integrity.diff, 0);
  });

  console.log('[PASS] M9 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M9 verification failed:', err);
  process.exit(1);
});
