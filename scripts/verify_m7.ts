import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import { UTF8_BOM, parseDelimitedSheet, serializeToUtf8BomCsv } from '../src/shared/csv';
import {
  matchImportedPurchaseRows,
  createPurchaseInvoice,
  getSuppliers,
  searchItems
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M7: Smart CSV/Excel Purchase Import & Universal UTF-8-BOM Export ===');

  // 1. UTF-8-BOM CSV Export round-trip test with Arabic headers & drug names
  const exportHeaders = ['كود الصنف', 'اسم الدواء', 'الكمية', 'سعر الجمهور'];
  const exportRows = [
    [1029, 'أوجمنتين 625 مجم - AUGMENTIN', 5, 96.0],
    [1, 'بانادول إكسترا', 10, 45.5]
  ];
  const csvOut = serializeToUtf8BomCsv(exportHeaders, exportRows);
  assert.ok(csvOut.startsWith(UTF8_BOM), 'CSV export MUST start with U+FEFF BOM');
  const utf8Bytes = Buffer.from(csvOut, 'utf8');
  assert.equal(utf8Bytes[0], 0xef);
  assert.equal(utf8Bytes[1], 0xbb);
  assert.equal(utf8Bytes[2], 0xbf);

  const parsedExport = parseDelimitedSheet(csvOut);
  assert.deepEqual(parsedExport.headers, exportHeaders);
  assert.equal(parsedExport.rows.length, 2);
  assert.equal(parsedExport.rows[0][1], 'أوجمنتين 625 مجم - AUGMENTIN');

  await withSandboxDb('m7', async (db) => {
    const sampleItems = db
      .prepare("SELECT item_id, item_name_en, barcode, consumer_price, current_stock FROM items WHERE LENGTH(TRIM(COALESCE(barcode,''))) >= 8 LIMIT 4")
      .all() as Array<{ item_id: number; item_name_en: string; barcode: string; consumer_price: number; current_stock: number }>;
    assert.equal(sampleItems.length, 4);

    // Build a 5-row supplier CSV: 3 by barcode, 1 by name, 1 completely unknown (manual resolve)
    const supplierCsv = [
      'Barcode,Item Name,Qty,Bonus,Consumer Price,Discount %,Expiry',
      `${sampleItems[0].barcode},,4,1,${sampleItems[0].consumer_price},20,12-2027`,
      `${sampleItems[1].barcode},,2,0,${sampleItems[1].consumer_price},15,11-2027`,
      `${sampleItems[2].barcode},,3,0,${sampleItems[2].consumer_price},10,10-2027`,
      `,${sampleItems[3].item_name_en},5,1,${sampleItems[3].consumer_price},25,09-2028`,
      `,UNKNOWN_IMPORT_DRUG_XYZ_999,2,0,50,20,01-2028`
    ].join('\r\n');

    const sheet = parseDelimitedSheet(supplierCsv);
    assert.equal(sheet.rows.length, 5);

    const mapJson = JSON.stringify({
      barcodeCol: 'Barcode',
      itemNameCol: 'Item Name',
      quantityCol: 'Qty',
      bonusCol: 'Bonus',
      consumerPriceCol: 'Consumer Price',
      discountPctCol: 'Discount %',
      expiryDateCol: 'Expiry'
    });

    const suppliersList = getSuppliers();
    const supplier = suppliersList.find(s => s.supplier_id > 1) || suppliersList[0];
    assert.ok(supplier, 'Expected at least one supplier');

    const matched = matchImportedPurchaseRows(
      sheet.rows.map((cells, idx) => ({
        rowIndex: idx + 1,
        barcode: cells[0],
        itemName: cells[1],
        quantity: Number(cells[2]),
        bonusQuantity: Number(cells[3]),
        consumerPrice: Number(cells[4]),
        discountPct: Number(cells[5]),
        expiryDate: cells[6]
      })),
      supplier.supplier_id,
      mapJson
    );

    assert.equal(matched.length, 5);
    assert.equal(matched[0].matchStatus, 'BARCODE');
    assert.equal(matched[1].matchStatus, 'BARCODE');
    assert.equal(matched[2].matchStatus, 'BARCODE');
    assert.equal(matched[3].matchStatus, 'NAME');
    assert.equal(matched[3].matchedItem?.item_id, sampleItems[3].item_id);
    assert.equal(matched[4].matchStatus, 'UNMATCHED');
    assert.equal(matched[4].matchedItem, null);

    // Confirm supplier column preference was persisted
    const refreshedSupplier = getSuppliers().find(s => s.supplier_id === supplier.supplier_id);
    assert.equal(refreshedSupplier?.excel_column_map_json, mapJson);

    // Manually link row 5 to a real catalog item before posting purchase invoice
    const fallbackItem = searchItems('AUGMENTIN 625', false, 5)[0] || sampleItems[0];
    const itemsToPost = [
      ...matched.slice(0, 4).map(m => ({
        item_id: m.matchedItem!.item_id,
        item_name: m.matchedItem!.item_name_en,
        quantity: m.resolvedQuantity,
        bonus_quantity: m.resolvedBonus,
        consumer_price: m.resolvedConsumerPrice,
        discount_pct: m.resolvedDiscountPct,
        buy_price: m.resolvedBuyPrice,
        expiry_date: m.resolvedExpiryDate,
        line_total: m.resolvedLineTotal
      })),
      {
        item_id: fallbackItem.item_id,
        item_name: fallbackItem.item_name_en,
        quantity: matched[4].resolvedQuantity,
        bonus_quantity: matched[4].resolvedBonus,
        consumer_price: matched[4].resolvedConsumerPrice,
        discount_pct: matched[4].resolvedDiscountPct,
        buy_price: matched[4].resolvedBuyPrice,
        expiry_date: matched[4].resolvedExpiryDate,
        line_total: matched[4].resolvedLineTotal
      }
    ];

    const res = createPurchaseInvoice({
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      paper_invoice_number: 'CSV-IMP-001',
      payment_method: 'آجل',
      items: itemsToPost,
      notes: 'استيراد M7 التحققي'
    });
    assert.equal(res.success, true);
    assert.equal(res.item_count, 5);

    const updatedItem0 = db
      .prepare('SELECT current_stock FROM items WHERE item_id = ?')
      .get(sampleItems[0].item_id) as { current_stock: number };
    assert.equal(
      Math.round((updatedItem0.current_stock - sampleItems[0].current_stock) * 100) / 100,
      5,
      'Expected qty(4) + bonus(1) = +5 stock increase'
    );
  });

  console.log('[PASS] M7 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M7 verification failed:', err);
  process.exit(1);
});
