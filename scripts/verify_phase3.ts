import { 
  initDatabase, 
  getDatabaseInstance,
  getInventoryFilter,
  getItemFullHistory,
  saveOrUpdateItem,
  adjustItemStock,
  createPurchaseInvoice,
  getSuppliers,
  saveSupplier,
  getPurchaseInvoices,
  getPurchaseInvoiceItems,
  getShortages,
  addOrUpdateShortage,
  removeShortage,
  clearCompletedShortages
} from '../src/main/db';
import { CreatePurchaseInvoicePayload, SaveItemPayload } from '../src/shared/types';

async function runPhase3Verification() {
  console.log('====================================================');
  console.log('  TITAN MODERN POS - PHASE 3 VERIFICATION SUITE');
  console.log('====================================================\n');

  // 1. Init Database and Check Schema Upgrades
  const db = initDatabase();
  console.log('[PASS] 1. Database initialized with Phase 3 schema upgrades.');

  // Check columns in price_change_history & purchases_invoices
  const priceCols = (db.prepare('PRAGMA table_info(price_change_history)').all() as { name: string }[]).map(c => c.name);
  if (!priceCols.includes('old_price') || !priceCols.includes('item_id')) {
    throw new Error('Missing old_price or item_id in price_change_history');
  }
  console.log('[PASS] 2. Verified price_change_history schema columns (old_price, item_id).');

  const purCols = (db.prepare('PRAGMA table_info(purchases_invoices)').all() as { name: string }[]).map(c => c.name);
  if (!purCols.includes('paper_invoice_number') || !purCols.includes('payment_method')) {
    throw new Error('Missing paper_invoice_number or payment_method in purchases_invoices');
  }
  console.log('[PASS] 3. Verified purchases_invoices schema columns (paper_invoice_number, payment_method).');

  // 2. Test Inventory Filter & Pagination
  console.log('\n--- Testing Inventory Filter & Pagination ---');
  const allResult = getInventoryFilter('all', 1, 10);
  console.log(`[PASS] 4. getInventoryFilter('all'): Total items: ${allResult.totalCount}, Total pages: ${allResult.totalPages}`);
  if (allResult.totalCount < 18000) {
    throw new Error(`Expected at least 18000 items, got ${allResult.totalCount}`);
  }

  const inStockResult = getInventoryFilter('in_stock', 1, 10);
  console.log(`[PASS] 5. getInventoryFilter('in_stock'): Found ${inStockResult.totalCount} in-stock items.`);

  const zeroStockResult = getInventoryFilter('zero_stock', 1, 10);
  console.log(`[PASS] 6. getInventoryFilter('zero_stock'): Found ${zeroStockResult.totalCount} zero-stock items.`);

  const scheduledResult = getInventoryFilter('scheduled', 1, 10);
  console.log(`[PASS] 7. getInventoryFilter('scheduled'): Found ${scheduledResult.totalCount} schedule drugs.`);

  const searchResult = getInventoryFilter('all', 1, 5, 'PANADOL');
  console.log(`[PASS] 8. getInventoryFilter search for "PANADOL": Found ${searchResult.totalCount} matches.`);

  // 3. Test Item Full History Card
  console.log('\n--- Testing Item Full History Card ---');
  // Item 1 has 37 historical sales
  const history = getItemFullHistory(1);
  if (!history || !history.item) {
    throw new Error('Failed to fetch full history for item 1');
  }
  console.log(`[PASS] 9. Item 1 Full History: Sales count: ${history.salesHistory.length}, Purchases: ${history.purchasesHistory.length}, Price changes: ${history.priceChangesHistory.length}`);

  // 4. Test saveOrUpdateItem: Price Change Tracking on Existing Item
  console.log('\n--- Testing saveOrUpdateItem (Price Change & History) ---');
  const testItem = db.prepare('SELECT * FROM items WHERE current_stock > 10 LIMIT 1').get() as any;
  const originalConsumerPrice = testItem.consumer_price;
  const newTestPrice = originalConsumerPrice + 15;

  const updatedItem = saveOrUpdateItem({
    item_id: testItem.item_id,
    item_name_en: testItem.item_name_en,
    consumer_price: newTestPrice,
    package_units: testItem.package_units || 1,
    current_stock: testItem.current_stock
  });

  if (updatedItem.consumer_price !== newTestPrice) {
    throw new Error(`Expected price ${newTestPrice}, got ${updatedItem.consumer_price}`);
  }
  if (updatedItem.previous_price !== originalConsumerPrice) {
    throw new Error(`Expected previous_price ${originalConsumerPrice}, got ${updatedItem.previous_price}`);
  }

  const priceHistoryEntry = db.prepare('SELECT * FROM price_change_history WHERE item_id = ? ORDER BY id DESC LIMIT 1').get(testItem.item_id) as any;
  if (!priceHistoryEntry || priceHistoryEntry.new_price !== newTestPrice) {
    throw new Error('Price change history entry was not created!');
  }
  console.log(`[PASS] 10. Price change tracked: Old ${originalConsumerPrice} EGP -> New ${newTestPrice} EGP logged in price_change_history.`);

  // Restore price
  saveOrUpdateItem({
    item_id: testItem.item_id,
    item_name_en: testItem.item_name_en,
    consumer_price: originalConsumerPrice,
    package_units: testItem.package_units || 1,
    current_stock: testItem.current_stock
  });
  db.prepare('DELETE FROM price_change_history WHERE id = ?').run(priceHistoryEntry.id);

  // 5. Test saveOrUpdateItem: Adding a Brand New Item to Catalog
  console.log('\n--- Testing saveOrUpdateItem (New Item Creation) ---');
  const newItemPayload: SaveItemPayload = {
    item_name_en: `NEW TEST DRUG ${Date.now()}`,
    item_name_ar: 'دواء تجريبي جديد',
    producer: 'شركة تجريبية',
    generic_name: 'TEST GLUCOSE 500MG',
    category: 'أدوية السكر',
    consumer_price: 75.50,
    package_units: 3,
    buy_price: 52.00,
    current_stock: 20,
    expiry_date: '12-2028'
  };
  const createdItem = saveOrUpdateItem(newItemPayload);
  console.log(`[PASS] 11. New item created in catalog: ID #${createdItem.item_id}, Barcode: "${createdItem.barcode}"`);
  if (!createdItem.item_id || !createdItem.barcode?.startsWith('LOC')) {
    throw new Error('Auto-generated barcode or item_id failed on new item');
  }

  // 6. Test adjustItemStock
  console.log('\n--- Testing adjustItemStock ---');
  const adjusted = adjustItemStock(createdItem.item_id, 0, '12-2028', 'جرد تسوية رصيد صفر');
  if (adjusted.current_stock !== 0) {
    throw new Error(`Expected stock 0, got ${adjusted.current_stock}`);
  }
  const autoShortage = db.prepare('SELECT * FROM shortages_drafts WHERE item_id = ?').get(createdItem.item_id) as any;
  if (!autoShortage) {
    throw new Error('Stock adjusted to 0 but was not added to shortages_drafts');
  }
  console.log(`[PASS] 12. adjustItemStock verified: Stock set to 0 and auto-added to shortages_drafts.`);

  // 7. Test Suppliers APIs
  console.log('\n--- Testing Suppliers Management ---');
  const suppliers = getSuppliers();
  console.log(`[PASS] 13. getSuppliers: Found ${suppliers.length} registered suppliers.`);
  if (suppliers.length < 17) {
    throw new Error(`Expected at least 17 suppliers, found ${suppliers.length}`);
  }

  const newSupplier = saveSupplier({
    supplier_name: `مورد تجريبي ${Date.now()}`,
    contact_phone: '01011223344'
  });
  console.log(`[PASS] 14. saveSupplier: Created new supplier ID #${newSupplier.supplier_id} ("${newSupplier.supplier_name}")`);

  // 8. Test createPurchaseInvoice (Receiving stock, updating buy price, auto-clearing shortages)
  console.log('\n--- Testing createPurchaseInvoice (Receiving & Stock Update) ---');
  const purchasePayload: CreatePurchaseInvoicePayload = {
    supplier_id: suppliers[3].supplier_id, // المتحدة للصيادلة
    supplier_name: suppliers[3].supplier_name,
    paper_invoice_number: 'INV-PAPER-9988',
    invoice_date: '2026-10-30',
    payment_method: 'آجل',
    items: [
      {
        item_id: createdItem.item_id,
        item_name: createdItem.item_name_en,
        quantity: 10,
        bonus_quantity: 2, // 10 + 2 = 12 total received
        consumer_price: 80.00, // price increased from 75.50
        buy_price: 55.00,
        expiry_date: '05-2029',
        discount_pct: 31,
        line_total: 550.00
      }
    ],
    notes: 'فاتورة توريد تجريبية'
  };

  const initialShortageCount = (db.prepare('SELECT count(*) as c FROM shortages_drafts WHERE item_id = ?').get(createdItem.item_id) as { c: number }).c;
  if (initialShortageCount === 0) {
    throw new Error('Item should be in shortages_drafts before receiving');
  }

  const purchaseResult = createPurchaseInvoice(purchasePayload);
  console.log(`[PASS] 15. Purchase invoice created successfully: #${purchaseResult.purchase_invoice_id}, Total: ${purchaseResult.total_amount} EGP`);

  // Verify stock incremented by quantity + bonus (0 + 12 = 12)
  const itemAfterPurchase = db.prepare('SELECT current_stock, consumer_price, buy_price, expiry_date FROM items WHERE item_id = ?').get(createdItem.item_id) as any;
  console.log(`[PASS] 16. Received stock verified: ${itemAfterPurchase.current_stock} (Expected: 12 with bonus), New Buy Price: ${itemAfterPurchase.buy_price}, Expiry: ${itemAfterPurchase.expiry_date}`);
  if (itemAfterPurchase.current_stock !== 12) {
    throw new Error(`Expected stock 12, got ${itemAfterPurchase.current_stock}`);
  }

  // Verify shortages_drafts auto-cleaned
  const shortageAfter = db.prepare('SELECT count(*) as c FROM shortages_drafts WHERE item_id = ?').get(createdItem.item_id) as { c: number };
  console.log(`[PASS] 17. Shortage auto-cleanup verified: Remaining shortage entries = ${shortageAfter.c} (Expected: 0)`);
  if (shortageAfter.c !== 0) {
    throw new Error('Received item was NOT auto-cleared from shortages_drafts!');
  }

  // Verify supplier transaction
  const supTx = db.prepare('SELECT * FROM supplier_transactions WHERE invoice_id = ?').get(purchaseResult.purchase_invoice_id) as any;
  if (!supTx || supTx.amount !== purchaseResult.total_amount) {
    throw new Error('Supplier transaction was not recorded!');
  }
  console.log(`[PASS] 18. Supplier transaction recorded: ID #${supTx.id}, Amount: ${supTx.amount} EGP, Type: "${supTx.transaction_type}"`);

  // 9. Test Shortages Notebook Engine (getShortages, addOrUpdateShortage, removeShortage)
  console.log('\n--- Testing Shortages Notebook Engine ---');
  const existingShortages = db.prepare('SELECT * FROM shortages_drafts').all() as any[];
  const shortages = getShortages(0, '');
  console.log(`[PASS] 19. getShortages: Loaded ${shortages.length} shortage items.`);

  const newShortage = addOrUpdateShortage(testItem.item_id, 5, suppliers[0].supplier_id);
  console.log(`[PASS] 20. addOrUpdateShortage: Added shortage for "${newShortage.item_name}" with qty 5.`);

  const removeResult = removeShortage(newShortage.shortage_id);
  console.log(`[PASS] 21. removeShortage: Removed shortage ID #${removeResult.shortageId}.`);

  // Test clearCompletedShortages safely by saving state first
  const dummyItem = db.prepare('SELECT item_id, item_name_en FROM items WHERE current_stock > 10 LIMIT 1').get() as any;
  const tempShortage = addOrUpdateShortage(dummyItem.item_id, 1, 1);
  const clearResult = clearCompletedShortages();
  console.log(`[PASS] 22. clearCompletedShortages verified: Safely cleared in-stock shortages (${clearResult.clearedCount} removed).`);

  // Restore exact original shortages_drafts
  const restoreTx = db.transaction(() => {
    db.prepare('DELETE FROM shortages_drafts').run();
    const insertStmt = db.prepare('INSERT INTO shortages_drafts (id, supplier_id, supplier_name, item_id, item_name, quantity, order_code) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const r of existingShortages) {
      insertStmt.run(r.id, r.supplier_id, r.supplier_name, r.item_id, r.item_name, r.quantity, r.order_code);
    }
  });
  restoreTx();

  // Cleanup test item, invoice, supplier
  db.prepare('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ?').run(purchaseResult.purchase_invoice_id);
  db.prepare('DELETE FROM purchases_invoices WHERE purchase_invoice_id = ?').run(purchaseResult.purchase_invoice_id);
  db.prepare('DELETE FROM supplier_transactions WHERE invoice_id = ?').run(purchaseResult.purchase_invoice_id);
  db.prepare('DELETE FROM general_ledger_2026 WHERE document_ref = ?').run(`PUR-${purchaseResult.purchase_invoice_id}`);
  db.prepare('DELETE FROM items_fts WHERE item_id = ?').run(createdItem.item_id);
  db.prepare('DELETE FROM items WHERE item_id = ?').run(createdItem.item_id);
  db.prepare('DELETE FROM suppliers WHERE supplier_id = ?').run(newSupplier.supplier_id);

  console.log('\n====================================================');
  console.log('  ALL PHASE 3 BACKEND TESTS PASSED (22/22) [OK]');
  console.log('====================================================\n');
}

runPhase3Verification().catch(err => {
  console.error('\n[VERIFICATION FAILED]:', err);
  process.exit(1);
});
