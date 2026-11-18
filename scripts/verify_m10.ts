import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import {
  saveOrUpdateItem,
  createSaleInvoice,
  getChronicPatients,
  saveChronicPatient,
  deleteChronicPatient,
  getInsuranceProviders,
  saveInsuranceProvider,
  getInsuranceClaims,
  recordInsuranceSettlement,
  checkCartInteractions,
  getSubstitutesAndAlternatives,
  checkLedgerIntegrity
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M10: Chronic Patients, Insurance, Generics vs Alternatives & DDI ===');

  await withSandboxDb('m10', async (db) => {
    // -------------------------------------------------------------
    // 1. Chronic Patient Profile & Prescription Persistence
    // -------------------------------------------------------------
    console.log('[1/5] Testing Chronic Patient Profile & Prescription...');
    const drugA = saveOrUpdateItem({
      item_name_en: 'CONCOR 5MG 30 TAB',
      item_name_ar: 'كونكور 5 مجم',
      generic_name: 'bisoprolol',
      category: 'Cardiovascular',
      consumer_price: 60,
      buy_price: 45,
      package_units: 1,
      current_stock: 20
    });

    const drugB = saveOrUpdateItem({
      item_name_en: 'GLUCOPHAGE 1000MG 30 TAB',
      item_name_ar: 'جلوكوفاج 1000 مجم',
      generic_name: 'metformin',
      category: 'Antidiabetic',
      consumer_price: 70,
      buy_price: 52,
      package_units: 1,
      current_stock: 15
    });

    const savedPatient = saveChronicPatient({
      patient_name: 'أحمد محمود عبد العال',
      phone: '01012345678',
      conditions: 'ضغط وسكر',
      refill_interval_days: 30,
      notes: 'متابعة قياس السكر التراكمي دورياً',
      items: [
        { item_id: drugA.item_id, dosage_notes: 'قرص صباحاً قبل الإفطار', quantity: 1 },
        { item_id: drugB.item_id, dosage_notes: 'قرص بعد الغداء والعشاء', quantity: 2 }
      ]
    });

    assert.ok(savedPatient.patient_id > 0, 'Expected valid patient_id');
    assert.equal(savedPatient.items?.length, 2, 'Expected 2 prescription items');

    const retrievedPatients = getChronicPatients('أحمد محمود');
    assert.ok(retrievedPatients.some((p) => p.patient_id === savedPatient.patient_id));

    // -------------------------------------------------------------
    // 2. Insurance Provider & Copay Sale Accounting (20% Patient / 80% Company)
    // -------------------------------------------------------------
    console.log('[2/5] Testing Insurance Copay Sale & Balanced GL Posting...');
    const providers = getInsuranceProviders();
    assert.ok(providers.length >= 1, 'Expected seeded insurance providers');
    const mednet = providers.find((p) => p.provider_name.includes('ميدنت')) || providers[0];

    const initialTreasury = db
      .prepare('SELECT cash_balance FROM treasury_state WHERE id = 1')
      .get() as { cash_balance: number };

    // Sale of 200 EGP: DrugA (60) + DrugB 2 packs (140) = 200 EGP
    const saleResult = createSaleInvoice({
      items: [
        {
          item_id: drugA.item_id,
          item_name: drugA.item_name_en,
          quantity: 1,
          unit_type: 'pack',
          package_units: 1,
          unit_price: 60,
          cost_price: 45,
          discount_pct: 0,
          line_total: 60
        },
        {
          item_id: drugB.item_id,
          item_name: drugB.item_name_en,
          quantity: 2,
          unit_type: 'pack',
          package_units: 1,
          unit_price: 70,
          cost_price: 52,
          discount_pct: 0,
          line_total: 140
        }
      ],
      payment_method: 'نقدي',
      discount: 0,
      client_name: savedPatient.patient_name,
      insurance_provider_id: mednet.provider_id,
      insurance_copay_pct: 20,
      patient_card_number: 'CARD-MEDNET-99128',
      chronic_patient_id: savedPatient.patient_id,
      user_id: 99,
      cashier_name: 'د. مريم الحميلي'
    });

    assert.equal(saleResult.patient_copay_amount, 40, 'Patient 20% copay should be 40 EGP');
    assert.equal(saleResult.company_claim_amount, 160, 'Company 80% claim should be 160 EGP');

    // Verify Treasury increased by patient copay ONLY (+40 EGP)
    const afterTreasury = db
      .prepare('SELECT cash_balance FROM treasury_state WHERE id = 1')
      .get() as { cash_balance: number };
    const treasuryDiff = Math.round((afterTreasury.cash_balance - initialTreasury.cash_balance) * 100) / 100;
    assert.equal(treasuryDiff, 40, 'Treasury must only receive patient copay of 40 EGP');

    // Verify insurance_claims record was created as PENDING for 160 EGP
    const claims = getInsuranceClaims(mednet.provider_id, 'PENDING');
    const claim = claims.find((c) => c.invoice_id === saleResult.invoice_number);
    assert.ok(claim, 'Expected pending insurance claim for invoice');
    assert.equal(claim.company_claim_amount, 160);
    assert.equal(claim.patient_copay_amount, 40);
    assert.equal(claim.status, 'PENDING');

    // Verify chronic patient refill date updated
    const updatedPatient = getChronicPatients(savedPatient.patient_name)[0];
    assert.ok(updatedPatient.last_refill_date.length > 0, 'Expected last_refill_date to be populated');
    assert.ok(updatedPatient.next_due_date.length > 0, 'Expected next_due_date to be calculated');

    // Verify GL integrity diff is exactly 0.00
    const integrityAfterSale = checkLedgerIntegrity();
    assert.equal(integrityAfterSale.diff, 0, 'GL diff must be 0.00 EGP after insurance sale');

    // -------------------------------------------------------------
    // 3. Insurance Settlement & GL Posting
    // -------------------------------------------------------------
    console.log('[3/5] Testing Insurance Settlement & Claim Auto-Settlement...');
    const settleRes = recordInsuranceSettlement(
      mednet.provider_id,
      160,
      'سداد شيك رقم 448102 - بنك مصر'
    );
    assert.equal(settleRes.success, true);
    assert.equal(settleRes.settledAmount, 160);

    const paidClaims = getInsuranceClaims(mednet.provider_id, 'PAID');
    assert.ok(paidClaims.some((c) => c.invoice_id === saleResult.invoice_number), 'Expected claim marked as PAID');

    const integrityAfterSettle = checkLedgerIntegrity();
    assert.equal(integrityAfterSettle.diff, 0, 'GL diff must be 0.00 EGP after settlement');

    // -------------------------------------------------------------
    // 4. Clinical Guard: Duplicate Generic & DDI Alerts
    // -------------------------------------------------------------
    console.log('[4/5] Testing Clinical DDI & Duplicate Generic Guard...');
    // Create two distinct items sharing the same generic_name
    const panadol = saveOrUpdateItem({
      item_name_en: 'PANADOL EXTRA 24 TAB',
      generic_name: 'paracetamol',
      consumer_price: 45,
      package_units: 1,
      current_stock: 10
    });
    const paramol = saveOrUpdateItem({
      item_name_en: 'PARAMOL 500MG 20 TAB',
      generic_name: 'paracetamol',
      consumer_price: 25,
      package_units: 1,
      current_stock: 10
    });

    const duplicateCheck = checkCartInteractions([
      { item_id: panadol.item_id },
      { item_id: paramol.item_id }
    ]);
    assert.equal(duplicateCheck.hasAlerts, true);
    assert.ok(duplicateCheck.alerts.some((a) => a.type === 'DUPLICATE_GENERIC'));

    // Create DDI pair (Warfarin + Aspirin)
    const warfarin = saveOrUpdateItem({
      item_name_en: 'MAREVAN 5MG (WARFARIN)',
      generic_name: 'warfarin',
      consumer_price: 30,
      package_units: 1,
      current_stock: 5
    });
    const aspirin = saveOrUpdateItem({
      item_name_en: 'ASPOCID 75MG (ASPIRIN)',
      generic_name: 'aspirin',
      consumer_price: 15,
      package_units: 1,
      current_stock: 5
    });

    const ddiCheck = checkCartInteractions([
      { item_id: warfarin.item_id },
      { item_id: aspirin.item_id }
    ]);
    assert.equal(ddiCheck.hasAlerts, true);
    const ddiAlert = ddiCheck.alerts.find((a) => a.type === 'DDI');
    assert.ok(ddiAlert, 'Expected DDI alert for Warfarin + Aspirin');
    assert.equal(ddiAlert.severity, 'HIGH');

    // Safe pair: no alerts
    const safeCheck = checkCartInteractions([
      { item_id: panadol.item_id },
      { item_id: drugB.item_id }
    ]);
    assert.equal(safeCheck.hasAlerts, false);

    // -------------------------------------------------------------
    // 5. DrugEye Substitutes vs Alternatives (Generics vs Category)
    // -------------------------------------------------------------
    console.log('[5/5] Testing DrugEye Generics vs Therapeutic Alternatives...');
    // Create another bisoprolol item
    const bisoCard = saveOrUpdateItem({
      item_name_en: 'BISOCARD 5MG 30 TAB',
      generic_name: 'bisoprolol',
      category: 'Cardiovascular',
      consumer_price: 48,
      package_units: 1,
      current_stock: 8
    });
    // Create an item in same category but different generic
    const amlodipine = saveOrUpdateItem({
      item_name_en: 'NORVASC 5MG 30 TAB',
      generic_name: 'amlodipine',
      category: 'Cardiovascular',
      consumer_price: 85,
      package_units: 1,
      current_stock: 5
    });

    const subRes = getSubstitutesAndAlternatives(drugA.item_id);
    assert.ok(subRes.sameGeneric.some((it) => it.item_id === bisoCard.item_id), 'Expected bisoCard in sameGeneric');
    assert.ok(
      !subRes.sameGeneric.some((it) => it.item_id === amlodipine.item_id),
      'Amlodipine must not appear in sameGeneric'
    );
    assert.ok(
      subRes.sameCategory.some((it) => it.item_id === amlodipine.item_id),
      'Expected amlodipine in sameCategory'
    );

    // Delete test patient cleanup
    deleteChronicPatient(savedPatient.patient_id);
    const afterDelete = getChronicPatients(savedPatient.patient_name);
    assert.equal(afterDelete.length, 0);

    console.log('✅ ALL M10 CHECKS PASSED WITH 0.00 EGP GL DIFF.');
  });
}

main().catch((err) => {
  console.error('❌ M10 Verification failed:', err);
  process.exit(1);
});
