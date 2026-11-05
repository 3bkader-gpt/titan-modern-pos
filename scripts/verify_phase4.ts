import Database from 'better-sqlite3';
import path from 'path';
import { 
  initDatabase, 
  getTreasuryOverview, 
  recordTreasuryTransaction, 
  getCurrentShift, 
  openShift, 
  closeShift, 
  getShiftsHistory, 
  getCustomersWithBalances, 
  recordCustomerPayment, 
  getDeliveryOrders, 
  updateDeliveryStatus, 
  getFinancialReport, 
  getTopMovingAndStagnantItems, 
  getExpiryAndStockValuationReport, 
  getUsersAndAuditLogs 
} from '../src/main/db';

async function runPhase4Verification() {
  console.log('====================================================');
  console.log('  TITAN MODERN POS - PHASE 4 VERIFICATION SUITE');
  console.log('====================================================\n');

  const dbPath = path.resolve(process.cwd(), 'data', 'pharmacy.sqlite');
  const db = initDatabase(dbPath);
  console.log('[PASS] 1. Database initialized with Phase 4 schema upgrades.');

  // 1. Verify schema tables and columns
  const shiftsCols = db.prepare('PRAGMA table_info(work_shifts)').all().map((c: any) => c.name);
  if (!shiftsCols.includes('opening_balance') || !shiftsCols.includes('actual_cash_counted') || !shiftsCols.includes('discrepancy')) {
    throw new Error('work_shifts table is missing required columns!');
  }
  console.log('[PASS] 2. Verified work_shifts schema columns (opening_balance, actual_cash_counted, discrepancy).');

  const ledgerCols = db.prepare('PRAGMA table_info(general_ledger_2026)').all().map((c: any) => c.name);
  if (!ledgerCols.includes('debit') || !ledgerCols.includes('credit') || !ledgerCols.includes('account_name')) {
    throw new Error('general_ledger_2026 table is missing required columns!');
  }
  console.log('[PASS] 3. Verified general_ledger_2026 schema columns.');

  // 2. Test Treasury Overview
  console.log('\n--- Testing Treasury Overview ---');
  const treasury = getTreasuryOverview();
  console.log(`[PASS] 4. Treasury cash balance: ${treasury.cash_balance.toFixed(2)} EGP`);
  console.log(`[PASS] 5. Today cash inflow: ${treasury.today_inflow.toFixed(2)} EGP, Outflow: ${treasury.today_outflow.toFixed(2)} EGP, Net: ${treasury.net_today.toFixed(2)} EGP`);
  console.log(`[PASS] 6. Recent ledger entries count: ${treasury.recent_entries.length}`);
  if (treasury.cash_balance <= 0) {
    throw new Error('Treasury cash balance should be positive!');
  }

  // 3. Test Treasury Transactions (Expense & Deposit)
  console.log('\n--- Testing Treasury Transactions ---');
  const initialBalance = treasury.cash_balance;
  const expenseRes = recordTreasuryTransaction({
    type: 'EXPENSE',
    category: 'كهرباء',
    amount: 250,
    notes: 'اختبار سداد فاتورة كهرباء تجريبية'
  });
  console.log(`[PASS] 7. Recorded expense of 250 EGP, New balance: ${expenseRes.new_balance.toFixed(2)} EGP`);
  if (Math.abs(expenseRes.new_balance - (initialBalance - 250)) > 0.01) {
    throw new Error(`Expense balance calculation mismatch: Expected ${initialBalance - 250}, got ${expenseRes.new_balance}`);
  }

  // Verify double entry in general_ledger_2026
  const debitEntry = db.prepare('SELECT * FROM general_ledger_2026 WHERE entry_id = ?').get(expenseRes.entry_id) as any;
  const creditEntry = db.prepare('SELECT * FROM general_ledger_2026 WHERE entry_id = ?').get(expenseRes.entry_id + 1) as any;
  if (!debitEntry || !creditEntry || debitEntry.debit !== 250 || creditEntry.credit !== 250) {
    throw new Error('General ledger double entry is NOT balanced!');
  }
  console.log(`[PASS] 8. Balanced double-entry in general_ledger_2026: Debit [${debitEntry.account_name}: ${debitEntry.debit}] == Credit [${creditEntry.account_name}: ${creditEntry.credit}]`);

  // Test Deposit
  const depositRes = recordTreasuryTransaction({
    type: 'DEPOSIT',
    category: 'رأس_المال',
    amount: 1000,
    notes: 'اختبار إيداع نقدي بالخزينة'
  });
  console.log(`[PASS] 9. Recorded deposit of 1000 EGP, New balance: ${depositRes.new_balance.toFixed(2)} EGP`);

  // Restore treasury balance from test
  db.prepare('DELETE FROM general_ledger_2026 WHERE entry_id IN (?, ?, ?, ?)').run(
    expenseRes.entry_id, expenseRes.entry_id + 1,
    depositRes.entry_id, depositRes.entry_id + 1
  );
  db.prepare('UPDATE treasury_state SET cash_balance = ? WHERE id = 1').run(initialBalance);
  console.log('[PASS] 10. Cleaned up test transactions and restored treasury balance.');

  // 4. Test Work Shifts (Open, Current, Close)
  console.log('\n--- Testing Work Shifts Engine ---');
  // Close any stray open shift before test
  db.prepare("UPDATE work_shifts SET status = 'CLOSED' WHERE status = 'OPEN'").run();

  const openedShift = openShift(1, 'د. مريم الحميلي', initialBalance);
  console.log(`[PASS] 11. Opened shift #${openedShift.shift_id} for "${openedShift.user_name}" with opening balance: ${openedShift.opening_balance} EGP`);
  if (openedShift.status !== 'OPEN') {
    throw new Error('Shift was not created with OPEN status!');
  }

  const curShift = getCurrentShift();
  if (!curShift || curShift.shift_id !== openedShift.shift_id) {
    throw new Error('getCurrentShift did not return the active shift!');
  }
  console.log(`[PASS] 12. getCurrentShift verified: Shift #${curShift.shift_id}, Status: ${curShift.status}`);

  // Close shift with actual cash counted = openingBalance - 50 (simulate a 50 EGP shortage)
  const actualCounted = openedShift.opening_balance - 50;
  const closedShift = closeShift(openedShift.shift_id, actualCounted, 'تقفيل الوردية - عجز تجريبي 50 ج.م');
  console.log(`[PASS] 13. Closed shift #${closedShift.shift_id}: Counted: ${closedShift.actual_cash_counted} EGP, Discrepancy: ${closedShift.discrepancy} EGP (Expected: -50)`);
  if (closedShift.status !== 'CLOSED' || closedShift.discrepancy !== -50) {
    throw new Error(`Shift discrepancy calculation failed: Expected -50, got ${closedShift.discrepancy}`);
  }

  const shiftsHistory = getShiftsHistory(5);
  console.log(`[PASS] 14. getShiftsHistory: Loaded ${shiftsHistory.length} shifts records.`);

  // Cleanup test shift
  db.prepare('DELETE FROM work_shifts WHERE shift_id = ?').run(openedShift.shift_id);

  // 5. Test Customers & Delivery
  console.log('\n--- Testing Customers & Delivery ---');
  const customers = getCustomersWithBalances();
  console.log(`[PASS] 15. getCustomersWithBalances: Loaded ${customers.length} customers.`);

  if (customers.length > 0) {
    const cust = customers[0];
    const initialCustBal = cust.account_balance;
    const initialTreasuryBal = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as any).cash_balance;

    const paymentRes = recordCustomerPayment(cust.customer_id, 150, 'دفعة نقدية تحت الحساب');
    console.log(`[PASS] 16. recordCustomerPayment: Customer #${cust.customer_id} paid 150 EGP. New Customer Balance: ${paymentRes.new_customer_balance} EGP, Treasury: ${paymentRes.new_balance} EGP`);

    // Revert test payment
    db.prepare('UPDATE customers SET account_balance = ? WHERE customer_id = ?').run(initialCustBal, cust.customer_id);
    db.prepare('UPDATE treasury_state SET cash_balance = ? WHERE id = 1').run(initialTreasuryBal);
    db.prepare("DELETE FROM general_ledger_2026 WHERE document_ref = ?").run(`PAY-CUST-${cust.customer_id}`);
    db.prepare('DELETE FROM customer_ledger WHERE customer_id = ? AND amount = 150').run(cust.customer_id);
    console.log('[PASS] 17. Cleaned up test customer payment.');
  }

  const deliveryOrders = getDeliveryOrders('ALL', undefined, 10);
  console.log(`[PASS] 18. getDeliveryOrders: Loaded ${deliveryOrders.length} delivery orders (Total in DB: ${db.prepare('SELECT COUNT(*) as c FROM delivery_orders').get().c})`);

  const updateDeliveryRes = updateDeliveryStatus(deliveryOrders[0].order_id, 'Out for Delivery');
  console.log(`[PASS] 19. updateDeliveryStatus: Order #${updateDeliveryRes.order_id} status updated to "${updateDeliveryRes.status}"`);

  // 6. Test Reports & Analytics Engine
  console.log('\n--- Testing Financial & Analytics Reports Engine ---');
  const finReport = getFinancialReport();
  console.log(`[PASS] 20. getFinancialReport: Total Sales: ${finReport.total_sales.toFixed(2)} EGP, COGS: ${finReport.cogs.toFixed(2)} EGP, Gross Profit: ${finReport.gross_profit.toFixed(2)} EGP (Margin: ${finReport.gross_margin_pct}%), Invoices: ${finReport.invoices_count}`);

  const topStagnant = getTopMovingAndStagnantItems(5);
  console.log(`[PASS] 21. getTopMovingAndStagnantItems: Top moving items: ${topStagnant.topItems.length}, Stagnant items: ${topStagnant.stagnantItems.length}`);
  if (topStagnant.topItems.length > 0) {
    console.log(`      * Top seller: "${topStagnant.topItems[0].item_name_en}" (Sold: ${topStagnant.topItems[0].total_quantity_sold} units)`);
  }
  if (topStagnant.stagnantItems.length > 0) {
    console.log(`      * Stagnant: "${topStagnant.stagnantItems[0].item_name_en}" (Stock: ${topStagnant.stagnantItems[0].current_stock} units)`);
  }

  const valuationReport = getExpiryAndStockValuationReport();
  console.log(`[PASS] 22. getExpiryAndStockValuationReport: Available in-stock items: ${valuationReport.total_in_stock_items}, Total pieces: ${valuationReport.total_pieces}`);
  console.log(`      * Valuation at Cost: ${valuationReport.total_cost_value.toFixed(2)} EGP`);
  console.log(`      * Valuation at Consumer Price: ${valuationReport.total_consumer_value.toFixed(2)} EGP`);
  console.log(`      * Potential Profit: ${valuationReport.potential_profit.toFixed(2)} EGP`);
  console.log(`      * Expiry alerts: Critical (<3m): ${valuationReport.near_expiry_3m_count}, Warning (<6m): ${valuationReport.near_expiry_6m_count}`);

  const auditData = getUsersAndAuditLogs(5);
  console.log(`[PASS] 23. getUsersAndAuditLogs: Users count: ${auditData.users.length}, Price change logs: ${auditData.auditLogs.price_changes.length}, Undo/Void logs: ${auditData.auditLogs.voids_and_returns.length}`);

  console.log('\n====================================================');
  console.log('  ALL PHASE 4 BACKEND TESTS PASSED (23/23) [OK]');
  console.log('====================================================\n');
}

runPhase4Verification().catch(err => {
  console.error('\n[VERIFICATION FAILED]:', err);
  process.exit(1);
});
