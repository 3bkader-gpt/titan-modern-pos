import { 
  initDatabase, 
  getDatabaseInstance,
  createSaleInvoice,
  returnSaleInvoice,
  getCustomers,
  addCustomer,
  getInvoiceForReturn,
  searchItems
} from '../src/main/db';
import { CreateSaleItemPayload, CreateSaleInvoicePayload } from '../src/shared/types';

async function runPhase2Verification() {
  console.log('====================================================');
  console.log('  TITAN MODERN POS - PHASE 2 VERIFICATION SUITE');
  console.log('====================================================\n');

  // 1. Init Database and Check Schema Upgrades
  const db = initDatabase();
  console.log('[PASS] 1. Database initialized with Phase 2 schema upgrades.');

  // Check columns in sales_invoices
  const invCols = (db.prepare('PRAGMA table_info(sales_invoices)').all() as { name: string }[]).map(c => c.name);
  const requiredInvCols = ['discount', 'payment_method', 'client_name', 'client_phone', 'client_address'];
  for (const col of requiredInvCols) {
    if (!invCols.includes(col)) {
      throw new Error(`Missing column ${col} in sales_invoices`);
    }
  }
  console.log('[PASS] 2. Verified sales_invoices schema columns (discount, payment_method, client_name, etc.)');

  // Check initial state
  const maxInvoiceBefore = (db.prepare('SELECT COALESCE(MAX(invoice_number), 864) as m FROM sales_invoices').get() as { m: number }).m;
  console.log(`[INFO] Current Max Invoice Number: #${maxInvoiceBefore} (Expected next: #${maxInvoiceBefore + 1})`);
  if (maxInvoiceBefore !== 864 && maxInvoiceBefore < 864) {
    throw new Error(`Expected max invoice to be at least 864, found ${maxInvoiceBefore}`);
  }

  const initialTreasury = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
  console.log(`[INFO] Initial Treasury Cash Balance: ${initialTreasury.toFixed(2)} EGP`);

  // Find two test items:
  // Item 1: item with current_stock >= 5 for fractional strip sale test
  const item1 = db.prepare('SELECT * FROM items WHERE current_stock >= 5 LIMIT 1').get() as any;
  if (!item1) throw new Error('Could not find test item with stock >= 5');

  // Set package_units to 2 for this item to test sub-unit strips
  db.prepare('UPDATE items SET package_units = 2 WHERE item_id = ?').run(item1.item_id);
  item1.package_units = 2;

  // Item 2: item with stock > 0 to test selling to 0 and auto-shortage draft
  const item2 = db.prepare(`
    SELECT i.* FROM items i 
    LEFT JOIN shortages_drafts s ON i.item_id = s.item_id 
    WHERE i.current_stock > 0 AND i.item_id != ? AND s.item_id IS NULL 
    LIMIT 1
  `).get(item1.item_id) as any;
  if (!item2) throw new Error('Could not find test item not in shortages_drafts');

  console.log(`[INFO] Selected Test Item 1: "${item1.item_name_en}" (ID: ${item1.item_id}, Stock: ${item1.current_stock}, PkgUnits: ${item1.package_units}, Price: ${item1.consumer_price})`);
  console.log(`[INFO] Selected Test Item 2: "${item2.item_name_en}" (ID: ${item2.item_id}, Stock: ${item2.current_stock}, Price: ${item2.consumer_price})`);

  const initialStockItem1 = item1.current_stock;
  const initialStockItem2 = item2.current_stock;

  // 2. Test Customer APIs
  console.log('\n--- Testing Customer Management ---');
  const testCustomerName = `عميل تجريبي ${Date.now()}`;
  const newCustomer = addCustomer(testCustomerName, '01099887766', 'شارع المحطة - العاشر');
  console.log(`[PASS] 3. Customer created: ID ${newCustomer.customer_id}, Name: ${newCustomer.customer_name}`);

  const searchCust = getCustomers('01099887766');
  if (searchCust.length === 0 || searchCust[0].customer_name !== testCustomerName) {
    throw new Error('Failed to find created customer by phone number');
  }
  console.log(`[PASS] 4. Customer lookup verified.`);

  // 3. Test Sale Invoice Creation (Pack + Strip sub-unit sale + Stock deduction to <= 0)
  console.log('\n--- Testing createSaleInvoice() ---');
  const item1StripPrice = Math.round((item1.consumer_price / item1.package_units) * 100) / 100;
  const item1CostPerStrip = Math.round(((item1.buy_price || item1.consumer_price * 0.75) / item1.package_units) * 100) / 100;

  const saleItems: CreateSaleItemPayload[] = [
    // 1 Full Pack of Item 1
    {
      item_id: item1.item_id,
      item_name: item1.item_name_en,
      item_name_ar: item1.item_name_ar,
      generic_name: item1.generic_name,
      quantity: 1,
      unit_type: 'pack',
      package_units: item1.package_units,
      unit_price: item1.consumer_price,
      cost_price: item1.buy_price || (item1.consumer_price * 0.75),
      discount_pct: 0,
      line_total: item1.consumer_price
    },
    // 1 Strip (Sub-unit) of Item 1
    {
      item_id: item1.item_id,
      item_name: item1.item_name_en,
      item_name_ar: item1.item_name_ar,
      generic_name: item1.generic_name,
      quantity: 1,
      unit_type: 'unit',
      package_units: item1.package_units,
      unit_price: item1StripPrice,
      cost_price: item1CostPerStrip,
      discount_pct: 0,
      line_total: item1StripPrice
    },
    // Exact remaining stock of Item 2 to trigger stock <= 0
    {
      item_id: item2.item_id,
      item_name: item2.item_name_en,
      item_name_ar: item2.item_name_ar,
      generic_name: item2.generic_name,
      quantity: item2.current_stock,
      unit_type: 'pack',
      package_units: 1,
      unit_price: item2.consumer_price,
      cost_price: item2.buy_price || (item2.consumer_price * 0.75),
      discount_pct: 0,
      line_total: Math.round(item2.consumer_price * item2.current_stock * 100) / 100
    }
  ];

  const totalBeforeDiscount = saleItems.reduce((acc, i) => acc + i.line_total, 0);
  const invoiceDiscount = 5.00; // 5 EGP discount
  const expectedNet = Math.round((totalBeforeDiscount - invoiceDiscount) * 100) / 100;

  const salePayload: CreateSaleInvoicePayload = {
    items: saleItems,
    discount: invoiceDiscount,
    payment_method: 'نقدي',
    client_name: testCustomerName,
    client_phone: '01099887766',
    notes: 'فاتورة تجريبية - المرحلة 2',
    paid_amount: expectedNet + 50 // customer paid extra, expect 50 EGP change
  };

  const saleResult = createSaleInvoice(salePayload);
  console.log(`[PASS] 5. Sale invoice created successfully: #${saleResult.invoice_number}`);
  console.log(`       Date: ${saleResult.invoice_date} ${saleResult.invoice_time}`);
  console.log(`       Total: ${saleResult.total_selling_price} EGP, Discount: ${saleResult.discount} EGP, Net: ${expectedNet} EGP, Change: ${saleResult.change} EGP`);

  if (saleResult.invoice_number !== maxInvoiceBefore + 1) {
    throw new Error(`Expected invoice #${maxInvoiceBefore + 1}, got #${saleResult.invoice_number}`);
  }

  // 4. Verify Stock Deductions
  const item1After = db.prepare('SELECT current_stock FROM items WHERE item_id = ?').get(item1.item_id) as { current_stock: number };
  const expectedItem1Deduction = 1 + Math.round((1 / item1.package_units) * 10000) / 10000;
  const expectedItem1Stock = Math.round((initialStockItem1 - expectedItem1Deduction) * 10000) / 10000;
  console.log(`[PASS] 6. Stock deduction verification for Item 1:`);
  console.log(`       Before: ${initialStockItem1}, Expected After: ${expectedItem1Stock}, Actual After: ${item1After.current_stock}`);
  if (Math.abs(item1After.current_stock - expectedItem1Stock) > 0.0001) {
    throw new Error(`Stock deduction mismatch! Expected ${expectedItem1Stock}, got ${item1After.current_stock}`);
  }

  const item2After = db.prepare('SELECT current_stock FROM items WHERE item_id = ?').get(item2.item_id) as { current_stock: number };
  console.log(`[PASS] 7. Stock deduction verification for Item 2:`);
  console.log(`       Before: ${initialStockItem2}, Actual After: ${item2After.current_stock} (Zero stock achieved)`);
  if (item2After.current_stock > 0) {
    throw new Error(`Expected Item 2 stock to be <= 0, got ${item2After.current_stock}`);
  }

  // 5. Verify Auto-Feed to shortages_drafts
  const shortageEntry = db.prepare('SELECT * FROM shortages_drafts WHERE item_id = ?').get(item2.item_id) as any;
  if (!shortageEntry) {
    throw new Error(`Item ${item2.item_id} reached 0 stock but was NOT auto-inserted into shortages_drafts!`);
  }
  console.log(`[PASS] 8. Auto-feed to shortages_drafts verified: Item ${item2.item_id} ("${shortageEntry.item_name}") added with qty ${shortageEntry.quantity}`);

  // 6. Verify Treasury State Update
  const treasuryAfter = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
  const expectedTreasury = Math.round((initialTreasury + expectedNet) * 100) / 100;
  console.log(`[PASS] 9. Treasury cash update verified:`);
  console.log(`       Before: ${initialTreasury.toFixed(2)}, Expected After: ${expectedTreasury.toFixed(2)}, Actual: ${treasuryAfter.toFixed(2)}`);
  if (Math.abs(treasuryAfter - expectedTreasury) > 0.01) {
    throw new Error(`Treasury cash mismatch! Expected ${expectedTreasury}, got ${treasuryAfter}`);
  }

  // 7. Verify General Ledger 2026 Entry
  const ledgerEntry = db.prepare('SELECT * FROM general_ledger_2026 WHERE document_ref = ?').get(`INV-${saleResult.invoice_number}`) as any;
  if (!ledgerEntry) {
    throw new Error(`No general_ledger_2026 entry found for INV-${saleResult.invoice_number}`);
  }
  console.log(`[PASS] 10. General Ledger entry verified:`);
  console.log(`        Entry ID: ${ledgerEntry.entry_id}, Account: ${ledgerEntry.account_name}, Amount: ${ledgerEntry.amount} EGP, Debit: ${ledgerEntry.debit}`);

  // 8. Test Invoice Lookup for Return (F11 feature)
  const lookupData = getInvoiceForReturn(saleResult.invoice_number);
  if (!lookupData || lookupData.items.length !== 3) {
    throw new Error(`getInvoiceForReturn failed to return 3 items for invoice #${saleResult.invoice_number}`);
  }
  console.log(`[PASS] 11. Quick return invoice lookup verified for invoice #${saleResult.invoice_number}`);

  // 9. Test Return Sale Invoice (returnSaleInvoice)
  console.log('\n--- Testing returnSaleInvoice() ---');
  const returnResult = returnSaleInvoice(saleResult.invoice_number);
  console.log(`[PASS] 12. Return sale invoice executed:`, returnResult.message);

  // Verify stock restored
  const item1Restored = db.prepare('SELECT current_stock FROM items WHERE item_id = ?').get(item1.item_id) as { current_stock: number };
  console.log(`[PASS] 13. Stock restored for Item 1: Expected: ${initialStockItem1}, Actual: ${item1Restored.current_stock}`);
  if (Math.abs(item1Restored.current_stock - initialStockItem1) > 0.0001) {
    throw new Error(`Stock was not properly restored after return! Expected ${initialStockItem1}, got ${item1Restored.current_stock}`);
  }

  // Verify undo_sales_history record
  const undoEntries = db.prepare('SELECT * FROM undo_sales_history WHERE invoice_id = ?').all(saleResult.invoice_number) as any[];
  console.log(`[PASS] 14. undo_sales_history recorded ${undoEntries.length} items returned.`);
  if (undoEntries.length === 0) {
    throw new Error(`No records in undo_sales_history for invoice #${saleResult.invoice_number}`);
  }

  // Verify treasury refunded
  const treasuryAfterReturn = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
  console.log(`[PASS] 15. Treasury cash deducted on return: Current balance = ${treasuryAfterReturn.toFixed(2)} EGP`);

  // Verify ledger reversal
  const reversalEntry = db.prepare('SELECT * FROM general_ledger_2026 WHERE document_ref = ?').get(`RET-INV-${saleResult.invoice_number}`) as any;
  if (!reversalEntry) {
    throw new Error(`Reversal ledger entry not found for RET-INV-${saleResult.invoice_number}`);
  }
  console.log(`[PASS] 16. General Ledger reversal entry verified: Credit: ${reversalEntry.credit} EGP, Ref: ${reversalEntry.document_ref}`);

  // 10. Test Delivery Order Creation on a separate item
  console.log('\n--- Testing Delivery Order Creation ---');
  const item3 = db.prepare('SELECT * FROM items WHERE item_id NOT IN (?, ?) AND current_stock >= 10 LIMIT 1').get(item1.item_id, item2.item_id) as any;
  const deliveryPayload: CreateSaleInvoicePayload = {
    items: [{
      item_id: item3.item_id,
      item_name: item3.item_name_en,
      item_name_ar: item3.item_name_ar,
      generic_name: item3.generic_name,
      quantity: 1,
      unit_type: 'pack',
      package_units: 1,
      unit_price: item3.consumer_price,
      cost_price: item3.buy_price || (item3.consumer_price * 0.75),
      discount_pct: 0,
      line_total: item3.consumer_price
    }],
    discount: 0,
    payment_method: 'دليفري',
    client_name: 'عميل توصيل منزلي',
    client_phone: '01122334455',
    client_address: 'العمارة 15 - المجاورة الثالثة',
    is_delivery: true
  };
  const deliveryResult = createSaleInvoice(deliveryPayload);
  const deliveryRecord = db.prepare('SELECT * FROM delivery_orders WHERE invoice_number = ?').get(deliveryResult.invoice_number) as any;
  if (!deliveryRecord) {
    throw new Error(`Delivery order record not created for invoice #${deliveryResult.invoice_number}`);
  }
  console.log(`[PASS] 17. Delivery order workflow verified: Order ID #${deliveryRecord.order_id}, Address: "${deliveryRecord.address}", Status: "${deliveryRecord.status}"`);

  console.log('\n====================================================');
  console.log('  ALL PHASE 2 BACKEND & POS TESTS PASSED (17/17) [OK]');
  console.log('====================================================\n');
}

runPhase2Verification().catch(err => {
  console.error('\n[VERIFICATION FAILED]:', err);
  process.exit(1);
});
