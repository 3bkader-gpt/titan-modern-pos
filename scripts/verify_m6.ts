import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import { computePhoneticKey, toWildcardSqlPattern } from '../src/shared/phonetic';
import {
  searchItems,
  advancedSearchItems,
  saveOrUpdateItem,
  addItemBarcode
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M6: 9-Method Advanced Drug Finder & Phonetic Engine ===');

  // 1. Pure phonetic & wildcard unit assertions
  const p1 = computePhoneticKey('AUGMENTIN');
  const p2 = computePhoneticKey('OJMANTYN');
  const p3 = computePhoneticKey('AGMENTIN');
  assert.equal(p2, p1, `Expected OJMANTYN (${p2}) == AUGMENTIN (${p1})`);
  assert.equal(p3, p1, `Expected AGMENTIN (${p3}) == AUGMENTIN (${p1})`);
  assert.equal(computePhoneticKey('PHARMA'), computePhoneticKey('FARMA'));
  assert.equal(toWildcardSqlPattern('AU*625'), 'AU%625%');

  await withSandboxDb('m6', async (db) => {
    // Verify phonetic_key backfilled across all 18k+ items
    const missingPhonetics = (
      db.prepare("SELECT COUNT(*) as cnt FROM items WHERE phonetic_key IS NULL OR phonetic_key = ''").get() as { cnt: number }
    ).cnt;
    assert.equal(missingPhonetics, 0, `Expected 0 missing phonetic_key rows, got ${missingPhonetics}`);

    // 2. Method 5: Phonetic Search (=OJMANTYN and =AGMENTIN -> AUGMENTIN)
    const ojmantynHits = searchItems('=OJMANTYN', false, 50);
    assert.ok(
      ojmantynHits.some(i => i.item_id === 1029 && i.item_name_en.toUpperCase().includes('AUGMENTIN')),
      'Expected =OJMANTYN to return AUGMENTIN 625MG (#1029)'
    );
    const agmentinHits = advancedSearchItems({ query: '=AGMENTIN', scope: 'ALL', limit: 50 });
    assert.ok(
      agmentinHits.some(i => i.item_id === 1029),
      'Expected =AGMENTIN to return AUGMENTIN 625MG (#1029)'
    );

    // 3. Method 4: Wildcard Search (AU*625 and AU*600)
    const wild625 = searchItems('AU*625', false, 50);
    assert.ok(
      wild625.some(i => i.item_id === 1029),
      'Expected AU*625 to match AUGMENTIN 625MG 10 TAB.'
    );
    const wild600 = advancedSearchItems({ query: 'AU*600', scope: 'ALL', limit: 50 });
    assert.ok(
      wild600.some(i => i.item_name_en.toUpperCase().includes('AUGMENTIN') && i.item_name_en.includes('600')),
      'Expected AU*600 to match AUGMENTIN 600MG / ES-600'
    );

    // 4. Method 3: Barcode Suffix Search (.1286 -> 6221045011286, plus secondary barcode suffix)
    const suffixHits = searchItems('.1286', false, 20);
    assert.ok(
      suffixHits.some(i => i.item_id === 1029 && i.barcode === '6221045011286'),
      'Expected .1286 to match AUGMENTIN 625MG barcode 6221045011286'
    );

    addItemBarcode(1029, '6220000994321', 'تشغيلة إضافية');
    const secSuffixHits = searchItems('.94321', false, 20);
    assert.ok(
      secSuffixHits.some(i => i.item_id === 1029),
      'Expected .94321 to match secondary barcode in item_barcodes'
    );

    // 5. Method 2: 3-Scope Filter (IN_STOCK <= 2,122 and all rows current_stock > 0; OUR_LIST respects last_bought_at/current_stock)
    const inStockSample = advancedSearchItems({ query: '', scope: 'IN_STOCK', limit: 200 });
    assert.ok(inStockSample.length > 0 && inStockSample.every(i => i.current_stock > 0), 'Every IN_STOCK item must have current_stock > 0');

    const totalInStockCount = (db.prepare('SELECT COUNT(*) as c FROM items WHERE current_stock > 0').get() as { c: number }).c;
    assert.ok(totalInStockCount <= 2200 && totalInStockCount >= 2000, `Unexpected in-stock count: ${totalInStockCount}`);

    // Zero-stock item never bought/sold must NOT appear in OUR_LIST or IN_STOCK
    const zeroUntraded = db.prepare(`
      SELECT item_id FROM items
      WHERE current_stock = 0 AND COALESCE(last_sold_at, '') = '' AND COALESCE(last_bought_at, '') = ''
      LIMIT 1
    `).get() as { item_id: number } | undefined;
    if (zeroUntraded) {
      const ourHitsForZero = advancedSearchItems({ query: String(zeroUntraded.item_id), scope: 'OUR_LIST', limit: 20 });
      assert.equal(
        ourHitsForZero.some(i => i.item_id === zeroUntraded.item_id),
        false,
        'Untraded zero-stock item must be excluded from OUR_LIST scope'
      );
    }

    // 6. Methods 6, 7 & 8: Short Code, Generic/Producer, Min/Max Price
    const updated = saveOrUpdateItem({
      item_id: 1029,
      item_name_en: 'AUGMENTIN 625MG 10 TAB.',
      consumer_price: 96,
      package_units: 1,
      current_stock: 5,
      short_code: 'AUG625'
    });
    assert.equal(updated.short_code, 'AUG625');

    const byShortCode = searchItems('aug625', false, 10);
    assert.equal(byShortCode[0]?.item_id, 1029, 'Expected short_code AUG625 to prioritize item #1029');

    const priceBandHits = advancedSearchItems({
      query: 'AUGMENTIN',
      scope: 'IN_STOCK',
      minPrice: 90,
      maxPrice: 100,
      shortCode: 'AUG',
      limit: 20
    });
    assert.ok(
      priceBandHits.some(i => i.item_id === 1029) &&
        priceBandHits.every(i => i.consumer_price >= 90 && i.consumer_price <= 100 && i.current_stock > 0),
      'Expected combined scope + min/max price + shortCode filter to match cleanly'
    );

    // 7. Generic + Producer filter check on PANADOL / similar items with generic_name & producer
    const withMeta = db.prepare(`
      SELECT item_id, generic_name, producer, consumer_price
      FROM items
      WHERE TRIM(COALESCE(generic_name, '')) != '' AND TRIM(COALESCE(producer, '')) != ''
      LIMIT 1
    `).get() as { item_id: number; generic_name: string; producer: string; consumer_price: number } | undefined;
    if (withMeta) {
      const metaHits = advancedSearchItems({
        genericName: withMeta.generic_name.slice(0, 6),
        producer: withMeta.producer.slice(0, 4),
        scope: 'ALL',
        limit: 50
      });
      assert.ok(
        metaHits.some(i => i.item_id === withMeta.item_id),
        'Expected genericName + producer filter to return matching item'
      );
    }
  });

  console.log('[PASS] M6 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M6 verification failed:', err);
  process.exit(1);
});
