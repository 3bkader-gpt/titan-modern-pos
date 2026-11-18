import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import {
  validateCode128Table,
  encodeCode128B,
  renderCode128SvgMarkup
} from '../src/shared/code128';
import {
  searchItems,
  getItemBarcodes,
  addItemBarcode,
  removeItemBarcode,
  ensureItemHasBarcode,
  saveOrUpdateItem
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M5: Thermal Code-128 Barcode Printing & Multi-Barcode ===');

  // 1. Validate Code-128B ISO/IEC 15417 table & SVG output
  assert.equal(validateCode128Table(), true, 'Code-128 widths table must pass parity & length validation');
  const encoded = encodeCode128B('6221000012345');
  assert.equal(encoded.codes[0], 104, 'Start Code B must be 104');
  assert.equal(encoded.codes[encoded.codes.length - 1], 106, 'Stop Code must be 106');
  const expectedChecksum =
    (104 + '6221000012345'.split('').reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 32) * (i + 1), 0)) % 103;
  assert.equal(encoded.checksum, expectedChecksum, 'Mod 103 checksum must match ISO 15417');

  const svg = renderCode128SvgMarkup('6221000012345');
  assert.ok(svg.startsWith('<svg') && svg.includes('<rect'), 'Expected valid SVG markup');

  await withSandboxDb('m5', async (db) => {
    const seededBarcodes = (db.prepare('SELECT COUNT(*) as c FROM item_barcodes').get() as { c: number }).c;
    assert.ok(seededBarcodes > 1000, `Expected pre-seeded item_barcodes rows, got ${seededBarcodes}`);

    const sampleItems = db
      .prepare('SELECT item_id, item_name_en FROM items WHERE current_stock > 0 LIMIT 2')
      .all() as Array<{ item_id: number; item_name_en: string }>;
    assert.equal(sampleItems.length, 2);
    const [targetItem, otherItem] = sampleItems;

    // 2. Link secondary barcode and verify POS search + GS1 DataMatrix search
    const added = addItemBarcode(targetItem.item_id, '6229998887776', 'باركود تشغيلة جديدة');
    assert.equal(added.barcode, '6229998887776');

    const directHits = searchItems('6229998887776');
    assert.equal(directHits.length, 1);
    assert.equal(directHits[0].item_id, targetItem.item_id);

    const gs1Hits = searchItems('(01)062299988877761728123110B1');
    assert.equal(gs1Hits.length, 1);
    assert.equal(gs1Hits[0].item_id, targetItem.item_id);

    // 3. Reject assigning the same barcode to a different item
    assert.throws(
      () => addItemBarcode(otherItem.item_id, '6229998887776', 'مكرر'),
      /مسجل بالفعل/
    );

    const listBeforeDelete = getItemBarcodes(targetItem.item_id);
    const primaryRow = listBeforeDelete.find((b) => b.is_primary === 1);
    if (primaryRow) {
      assert.throws(() => removeItemBarcode(primaryRow.id), /الباركود الأساسي/);
    }
    const delRes = removeItemBarcode(added.id);
    assert.equal(delRes.success, true);

    // 4. Generate internal barcode for an item without a barcode
    const createdNoBarcode = saveOrUpdateItem({
      item_name_en: 'NO BARCODE SYRUP TEST',
      consumer_price: 45,
      package_units: 1,
      current_stock: 5
    });
    db.prepare("UPDATE items SET barcode = '' WHERE item_id = ?").run(createdNoBarcode.item_id);
    const generatedCode = ensureItemHasBarcode(createdNoBarcode.item_id);
    assert.match(generatedCode, /^98\d{10}$/);
    const genHits = searchItems(generatedCode);
    assert.equal(genHits.length, 1);
    assert.equal(genHits[0].item_id, createdNoBarcode.item_id);
  });

  console.log('[PASS] M5 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M5 verification failed:', err);
  process.exit(1);
});
