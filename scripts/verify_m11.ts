import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import {
  saveOrUpdateItem,
  createSaleInvoice,
  clockStaffAttendance,
  getStaffAttendanceLogs,
  getStaffSalesAndIncentivesReport,
  getLiveNetCapitalReport,
  executeDailyClosing,
  getDailyClosings,
  checkLedgerIntegrity,
  getTotalSuppliersGlPayable,
  getLocalDateTime
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M11: Staff Attendance, Incentives, Net Capital & EOD Closing ===');

  await withSandboxDb('m11', async (db) => {
    // -------------------------------------------------------------
    // 1. DDL Schema & Item Incentive Bonus Persistence
    // -------------------------------------------------------------
    console.log('[1/5] Verifying M11 DDL Schema & Item Incentive Bonus...');

    // Assert items.incentive_bonus column exists
    const itemCols = db.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>;
    assert.ok(itemCols.some(c => c.name === 'incentive_bonus'), 'Column items.incentive_bonus missing');

    // Assert staff_attendance table exists
    const attCols = db.prepare("PRAGMA table_info(staff_attendance)").all() as Array<{ name: string }>;
    assert.ok(attCols.some(c => c.name === 'user_id'), 'Column staff_attendance.user_id missing');
    assert.ok(attCols.some(c => c.name === 'worked_minutes'), 'Column staff_attendance.worked_minutes missing');

    // Assert daily_closings table exists
    const closCols = db.prepare("PRAGMA table_info(daily_closings)").all() as Array<{ name: string }>;
    assert.ok(closCols.some(c => c.name === 'closing_date'), 'Column daily_closings.closing_date missing');
    assert.ok(closCols.some(c => c.name === 'net_capital_snapshot'), 'Column daily_closings.net_capital_snapshot missing');

    // Create item with incentive bonus
    const bonusItem = saveOrUpdateItem({
      item_name_en: 'PANADOL EXTRA 24 TAB',
      item_name_ar: 'بنادول إكسترا 24 قرص',
      generic_name: 'paracetamol + caffeine',
      category: 'Analgesics',
      consumer_price: 45,
      buy_price: 35,
      package_units: 1,
      current_stock: 50,
      incentive_bonus: 5 // 5 EGP bonus per box sold
    });

    assert.equal(bonusItem.incentive_bonus, 5, 'Item incentive bonus was not persisted properly');
    console.log('  -> DDL schema and incentive_bonus persistence verified.');

    // -------------------------------------------------------------
    // 2. Staff Attendance by Barcode & Worked Minutes
    // -------------------------------------------------------------
    console.log('[2/5] Testing Staff Attendance by Barcode & Worked Minutes...');

    // Ensure staff member #3 exists with barcode EMP-3 and active status
    db.prepare(`
      UPDATE users 
      SET is_active = 1, role = 'PHARMACIST', badge_barcode = 'EMP-3', pin_code = '1111', commission_pct = 5
      WHERE user_id = 3
    `).run();

    // Negative tests: non-existent barcode
    assert.throws(
      () => clockStaffAttendance('INVALID_BARCODE_999999'),
      /الموظف غير موجود أو باركود الكارنيه/,
      'Expected non-existent barcode to throw'
    );

    // Negative tests: wrong PIN code
    assert.throws(
      () => clockStaffAttendance('EMP-3', 'WRONG_PIN'),
      /كود PIN غير صحيح/,
      'Expected wrong PIN to throw'
    );

    // Clock IN
    const clockInResult = clockStaffAttendance('EMP-3', '1111');
    assert.equal(clockInResult.success, true);
    assert.equal(clockInResult.type, 'CHECK_IN');
    assert.equal(clockInResult.record.user_id, 3);
    assert.equal(clockInResult.record.worked_minutes, 0);
    assert.ok(clockInResult.record.check_in_at.length > 0);
    assert.equal(clockInResult.record.check_out_at, '');

    // Clock OUT
    const clockOutResult = clockStaffAttendance('EMP-3', '1111');
    assert.equal(clockOutResult.success, true);
    assert.equal(clockOutResult.type, 'CHECK_OUT');
    assert.equal(clockOutResult.record.user_id, 3);
    assert.ok(clockOutResult.record.worked_minutes >= 1, `Expected worked_minutes >= 1, got ${clockOutResult.record.worked_minutes}`);
    assert.ok(clockOutResult.record.check_out_at.length > 0);

    // Verify logs query
    const logs = getStaffAttendanceLogs(3);
    assert.ok(logs.length >= 1, 'Expected at least 1 attendance log for user #3');
    assert.equal(logs[0].user_id, 3);
    console.log(`  -> Staff clocked in and out successfully (worked ${clockOutResult.record.worked_minutes} minutes).`);

    // -------------------------------------------------------------
    // 3. Staff Sales Performance & Incentive Commission Linked to Sale
    // -------------------------------------------------------------
    console.log('[3/5] Testing Staff Performance Report & Commission Linking...');

    const today = getLocalDateTime().date;

    // Create a sale invoice made by user #3 selling 4 boxes of Panadol Extra (bonus 5 EGP each)
    const saleRes = createSaleInvoice({
      items: [
        {
          item_id: bonusItem.item_id,
          item_name: bonusItem.item_name_en,
          quantity: 4,
          unit_price: 45,
          unit_type: 'pack',
          package_units: 1,
          discount_pct: 0
        }
      ],
      payment_method: 'نقدي',
      user_id: 3,
      cashier_name: 'د. مريم الحميلي'
    });

    assert.ok(saleRes.success, 'Sale invoice creation failed');

    // Query staff performance report for today
    const performance = getStaffSalesAndIncentivesReport(today, today);
    const user3Perf = performance.find(p => p.user_id === 3);

    assert.ok(user3Perf, 'Expected user #3 in performance report');
    assert.ok(user3Perf.sales_count >= 1, 'Expected at least 1 sale');
    assert.ok(user3Perf.total_sales_amount >= 180, `Expected total_sales >= 180, got ${user3Perf.total_sales_amount}`);

    // Expected commission: (4 boxes * 5 EGP bonus = 20 EGP) + (5% user commission on 180 EGP = 9 EGP) = 29 EGP
    const expectedBonus = 4 * 5; // 20
    const expectedPctComm = 180 * 0.05; // 9
    const expectedTotalComm = expectedBonus + expectedPctComm; // 29
    assert.equal(user3Perf.commission_amount, expectedTotalComm, `Expected commission ${expectedTotalComm}, got ${user3Perf.commission_amount}`);
    assert.ok(user3Perf.worked_hours > 0, 'Expected recorded worked hours');
    console.log(`  -> Staff performance verified: Sales ${user3Perf.net_sales_amount} EGP, Commission ${user3Perf.commission_amount} EGP (Bonus + 5%).`);

    // -------------------------------------------------------------
    // 4. Live Net Capital Report on #1989 Production Database Snapshot
    // -------------------------------------------------------------
    console.log('[4/5] Testing Live Net Capital Report on #1989 Snapshot...');

    const inStockCount = (db.prepare('SELECT count(*) as c FROM items WHERE current_stock > 0').get() as { c: number }).c;
    // In #1989 baseline, in-stock count is 2,122 (plus our newly inserted items if any)
    assert.ok(inStockCount >= 2122, `Expected >= 2122 in-stock items, found ${inStockCount}`);

    const netCap = getLiveNetCapitalReport();
    console.log('  Live Net Capital Breakdown:', {
      inventory_cost_value: netCap.inventory_cost_value,
      cash_balance: netCap.cash_balance,
      customer_receivables: netCap.customer_receivables,
      insurance_receivables: netCap.insurance_receivables,
      suppliers_payable: netCap.suppliers_payable,
      net_capital: netCap.net_capital,
      gl_diff: netCap.gl_integrity.diff
    });

    // Check invariants
    assert.ok(netCap.inventory_cost_value > 0, 'Inventory cost value must be > 0');
    assert.ok(netCap.cash_balance > 0, 'Cash balance must be > 0');
    assert.ok(netCap.suppliers_payable > 0, 'Suppliers payable must include #1989 historical debt under خصوم.متداولة.موردين.الكل');
    
    // Formula verification: Net Capital = Inventory + Cash + Customers + Insurance - Suppliers
    const expectedNetCapital = Math.round(
      (netCap.inventory_cost_value + netCap.cash_balance + netCap.customer_receivables + netCap.insurance_receivables - netCap.suppliers_payable) * 100
    ) / 100;
    assert.equal(netCap.net_capital, expectedNetCapital, 'Net capital calculation did not match the canonical formula');

    // GL Integrity check
    assert.equal(netCap.gl_integrity.diff, 0, 'Expected GL diff to be strictly 0.00 EGP');
    console.log('  -> Live Net Capital Report passed all mathematical and GL integrity assertions.');

    // -------------------------------------------------------------
    // 5. EOD Daily Closing Execution, Variance GL & Invoice Locking
    // -------------------------------------------------------------
    console.log('[5/5] Testing EOD Daily Closing, Cash Variance GL & Invoices Locking...');

    const treasuryBefore = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
    const testCountedCash = Math.round((treasuryBefore - 150) * 100) / 100; // 150 EGP cash deficit

    const eodResult = executeDailyClosing({
      closing_date: today,
      counted_cash: testCountedCash,
      notes: 'إغلاق نهاية اليوم الاختباري لفحص العجز وتوازن الأستاذ وقفل الفواتير',
      closed_by_user_id: 1,
      closed_by_user_name: 'د. مريم الحميلي'
    });

    assert.equal(eodResult.closing.closing_date, today);
    assert.equal(eodResult.closing.expected_cash, treasuryBefore);
    assert.equal(eodResult.closing.counted_cash, testCountedCash);
    assert.equal(eodResult.closing.cash_variance, -150);
    assert.equal(eodResult.gl_variance_posted, true);

    // Verify treasury updated to counted cash
    const treasuryAfter = (db.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number }).cash_balance;
    assert.equal(treasuryAfter, testCountedCash, 'Treasury balance was not updated to counted cash');

    // Verify GL entries posted for cash deficit (مصروفات.تشغيلية.عجز خزينة / اصول.متداولة.نقدية.كاش)
    const deficitGl = db.prepare(`
      SELECT * FROM general_ledger_2026 
      WHERE document_ref = ? AND account_name = 'مصروفات.تشغيلية.عجز خزينة'
    `).get(`EOD-${today}`) as { debit: number; credit: number } | undefined;
    assert.ok(deficitGl, 'Expected GL entry for cash deficit');
    assert.equal(deficitGl.debit, 150);

    // Verify GL integrity remains exactly 0.00 EGP diff
    const glStatus = checkLedgerIntegrity();
    assert.equal(glStatus.diff, 0, `Expected 0.00 EGP GL diff after EOD, got ${glStatus.diff}`);

    // Verify invoices for today are now locked
    const lockedInvoices = db.prepare('SELECT count(*) as c FROM sales_invoices WHERE invoice_date = ? AND is_locked = 1').get(today) as { c: number };
    assert.ok(lockedInvoices.c >= 1, 'Expected today invoices to be locked (is_locked = 1)');

    // Verify duplicate EOD on same date is rejected
    assert.throws(
      () => executeDailyClosing({
        closing_date: today,
        counted_cash: testCountedCash,
        closed_by_user_id: 1,
        closed_by_user_name: 'د. مريم الحميلي'
      }),
      /تم إغلاق يومية تاريخ/,
      'Expected duplicate EOD on same date to be rejected'
    );

    // Verify getDailyClosings list
    const closingsList = getDailyClosings(10);
    assert.ok(closingsList.length >= 1, 'Expected closing in getDailyClosings()');
    assert.equal(closingsList[0].closing_date, today);
    console.log(`  -> EOD Closing executed cleanly: Variance -150 EGP posted to GL, invoices locked, GL diff 0.00 EGP.`);
  });

  console.log('[PASS] M11 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M11 verification failed:', err);
  process.exit(1);
});
