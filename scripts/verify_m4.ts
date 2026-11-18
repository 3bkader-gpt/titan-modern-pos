import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import { calculateInvoicePricing } from '../src/shared/pricing';
import { saveOrUpdateItem, createSaleInvoice } from '../src/main/db';

async function main() {
  console.log('=== VERIFY M4: Smart Discount Modes, Below-Cost Guard & Dual Temp Price ===');

  await withSandboxDb('m4', async (db) => {
    // Configure a clean test drug with retail=100, buy=80, temp_price=92 (active=1)
    const testItem = saveOrUpdateItem({
      item_name_en: 'TITAN SMART PRICING TEST 100',
      item_name_ar: 'دواء اختبار التسعير الذكي',
      consumer_price: 100,
      buy_price: 80,
      package_units: 1,
      current_stock: 20,
      temp_price: 92,
      temp_price_active: 1
    });

    assert.equal(testItem.consumer_price, 100);
    assert.equal(testItem.temp_price, 92);
    assert.equal(testItem.temp_price_active, 1);

    // Pure helper sanity check
    const pureProfit50 = calculateInvoicePricing(
      [{ line_total: 100, cost_price: 80, quantity: 1 }],
      'PROFIT_PCT',
      50
    );
    assert.equal(pureProfit50.discountAmount, 10);
    assert.equal(pureProfit50.netTotal, 90);
    assert.equal(pureProfit50.isBelowCost, false);

    // Test 1: PROFIT_PCT (50%) -> margin is 20, discount = 10, netTotal = 90, profit = 10
    const resProfitPct = createSaleInvoice({
      user_id: 2,
      user_role: 'ADMIN',
      discount: 0,
      discount_mode: 'PROFIT_PCT',
      discount_input_value: 50,
      payment_method: 'نقدي',
      items: [
        {
          item_id: testItem.item_id,
          item_name: testItem.item_name_en,
          quantity: 1,
          unit_type: 'pack',
          package_units: 1,
          unit_price: 100,
          cost_price: 80,
          discount_pct: 0,
          line_total: 100
        }
      ]
    });
    assert.equal(resProfitPct.total_selling_price, 100);
    assert.equal(resProfitPct.discount, 10);
    assert.equal(resProfitPct.profit, 10);

    // Test 2: TOTAL_PCT (50%) -> net 50 < 80 -> MUST reject for CASHIER without override PIN
    assert.throws(
      () =>
        createSaleInvoice({
          user_id: 4,
          user_role: 'CASHIER',
          discount: 0,
          discount_mode: 'TOTAL_PCT',
          discount_input_value: 50,
          payment_method: 'نقدي',
          items: [
            {
              item_id: testItem.item_id,
              item_name: testItem.item_name_en,
              quantity: 1,
              unit_type: 'pack',
              package_units: 1,
              unit_price: 100,
              cost_price: 80,
              discount_pct: 0,
              line_total: 100
            }
          ]
        }),
      /BELOW_COST_REQUIRES_MANAGER_OVERRIDE/
    );

    // Now supply Manager Override PIN ('1989') -> MUST succeed
    const resOverride = createSaleInvoice({
      user_id: 4,
      user_role: 'CASHIER',
      manager_override_pin: '1989',
      discount: 0,
      discount_mode: 'TOTAL_PCT',
      discount_input_value: 50,
      payment_method: 'نقدي',
      items: [
        {
          item_id: testItem.item_id,
          item_name: testItem.item_name_en,
          quantity: 1,
          unit_type: 'pack',
          package_units: 1,
          unit_price: 100,
          cost_price: 80,
          discount_pct: 0,
          line_total: 100
        }
      ]
    });
    assert.equal(resOverride.discount, 50);
    assert.equal(resOverride.profit, -30);

    const savedMeta = db
      .prepare('SELECT discount_mode, override_manager_name FROM sales_invoices WHERE invoice_number = ?')
      .get(resOverride.invoice_number) as { discount_mode: string; override_manager_name: string };
    assert.equal(savedMeta.discount_mode, 'TOTAL_PCT');
    assert.equal(savedMeta.override_manager_name, 'مدير الصيدلية');

    // Test 3: TEMP_PRICE active -> unit_price becomes 92, total_selling_price = 92, profit = 12
    const resTemp = createSaleInvoice({
      user_id: 2,
      user_role: 'ADMIN',
      discount: 0,
      payment_method: 'نقدي',
      items: [
        {
          item_id: testItem.item_id,
          item_name: testItem.item_name_en,
          quantity: 1,
          unit_type: 'pack',
          package_units: 1,
          unit_price: 100, // deliberately pass consumer; server resolves TEMP_PRICE=92
          cost_price: 80,
          discount_pct: 0,
          line_total: 100,
          applied_price_source: 'TEMP_PRICE'
        }
      ]
    });
    assert.equal(resTemp.total_selling_price, 92);
    assert.equal(resTemp.profit, 12);

    const itemLineMeta = db
      .prepare('SELECT applied_price_source, unit_price FROM sales_invoice_items WHERE invoice_number = ?')
      .get(resTemp.invoice_number) as { applied_price_source: string; unit_price: number };
    assert.equal(itemLineMeta.applied_price_source, 'TEMP_PRICE');
    assert.equal(itemLineMeta.unit_price, 92);
  });

  console.log('[PASS] M4 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M4 verification failed:', err);
  process.exit(1);
});
