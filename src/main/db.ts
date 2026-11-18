import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { 
  Item, 
  MedicalAlert, 
  SalesInvoice, 
  SalesInvoiceItem, 
  DashboardStats,
  CreateSaleInvoicePayload,
  CreateSaleInvoiceResult,
  ReturnItemPayload,
  ReturnSaleInvoiceResult,
  Customer,
  ItemFullHistory,
  InventoryFilterType,
  InventoryFilterResult,
  Supplier,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  CreatePurchaseItemPayload,
  CreatePurchaseInvoicePayload,
  CreatePurchaseInvoiceResult,
  SupplierStatementEntry,
  SupplierStatementReport,
  RecordSupplierPaymentPayload,
  CreatePurchaseReturnPayload,
  PurchaseReturnRecord,
  ShortageItem,
  SaveItemPayload,
  LedgerEntry,
  TreasuryOverview,
  RecordTreasuryTransactionPayload,
  WorkShift,
  DeliveryOrder,
  FinancialReport,
  TopItem,
  StagnantItem,
  StockValuationReport,
  NearExpiryItem,
  UserRole,
  UserAccount,
  AuthSession,
  LoginAuditEntry,
  SaveUserPayload,
  InvoiceEditEligibility,
  EditableSaleInvoiceLine,
  EditableSaleInvoiceData,
  UpdateSaleInvoicePayload,
  InvoiceRevisionEntry,
  DiscountMode,
  ItemBarcodeEntry,
  SearchScope,
  AdvancedDrugSearchFilter,
  ImportedPurchaseRowInput,
  MatchedImportPurchaseRow,
  SmartShortageFilter,
  SmartShortageItem,
  SupplierPurchaseHistoryOffer,
  ItemVelocityAndBestSupplierReport,
  StocktakeSessionRecord,
  PostStocktakeSessionPayload,
  PostStocktakeSessionResult,
  ExpiryRiskItem,
  MergeItemsResult,
  DuplicateCandidatePair,
  StockAndLedgerAuditReport,
  AuditLogs,
  LedgerIntegrityStatus,
  ChronicPatient,
  ChronicPatientItem,
  SaveChronicPatientPayload,
  InsuranceProvider,
  InsuranceClaimRecord,
  DrugInteractionAlert,
  CartInteractionCheckResult,
  SubstitutesAndAlternativesResult
} from '../shared/types';
import { calculateInvoicePricing } from '../shared/pricing';
import { computePhoneticKey, toWildcardSqlPattern } from '../shared/phonetic';

let db: Database.Database | null = null;
let activeDbFilePath: string | null = null;

export function getLocalDateTime(d: Date = new Date()): { date: string; time: string; timestamp: string; year: number } {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  const date = `${year}-${month}-${day}`;
  const time = `${hours}:${minutes}:${seconds}`;
  return { date, time, timestamp: `${date} ${time}`, year };
}

function ensureSchemaUpgrades(database: Database.Database) {
  const safeAddColumn = (table: string, columnDef: string) => {
    try {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('duplicate column name')) {
        // benign or expected duplicate column
      }
    }
  };

  // Phase 2 POS
  safeAddColumn('sales_invoices', 'discount REAL DEFAULT 0');
  safeAddColumn('sales_invoices', "payment_method TEXT DEFAULT 'نقدي'");
  safeAddColumn('sales_invoices', "client_name TEXT DEFAULT ''");
  safeAddColumn('sales_invoices', "client_phone TEXT DEFAULT ''");
  safeAddColumn('sales_invoices', "client_address TEXT DEFAULT ''");
  safeAddColumn('sales_invoices', "notes TEXT DEFAULT ''");

  safeAddColumn('sales_invoice_items', "unit_type TEXT DEFAULT 'عبوة'");
  safeAddColumn('sales_invoice_items', 'cost_price REAL DEFAULT 0');
  safeAddColumn('sales_invoice_items', 'returned_quantity REAL DEFAULT 0');

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS sales_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number INTEGER NOT NULL,
        line_number INTEGER,
        item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        unit_type TEXT DEFAULT 'عبوة',
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        discount_pct REAL DEFAULT 0,
        effective_unit_price REAL NOT NULL,
        refund_amount REAL NOT NULL,
        payment_method TEXT DEFAULT 'نقدي',
        return_date TEXT NOT NULL,
        return_time TEXT NOT NULL,
        return_timestamp TEXT NOT NULL,
        user_name TEXT DEFAULT 'مدير الصيدلية',
        notes TEXT
      );
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_sales_returns_inv ON sales_returns(invoice_number);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_sales_returns_item ON sales_returns(item_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date);');
  } catch {
    // Table created or exists
  }

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS inventory_adjustments_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        old_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        difference REAL NOT NULL,
        old_expiry TEXT,
        new_expiry TEXT,
        reason TEXT NOT NULL,
        user_name TEXT DEFAULT 'مدير الصيدلية',
        adjusted_at TEXT NOT NULL
      );
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_inv_adj_item ON inventory_adjustments_log(item_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_inv_adj_date ON inventory_adjustments_log(adjusted_at);');
  } catch {
    // Table created or exists
  }

  safeAddColumn('delivery_orders', "customer_name TEXT DEFAULT ''");
  safeAddColumn('delivery_orders', "phone TEXT DEFAULT ''");
  safeAddColumn('delivery_orders', "address TEXT DEFAULT ''");
  safeAddColumn('delivery_orders', 'invoice_number INTEGER DEFAULT 0');
  safeAddColumn('delivery_orders', 'total_amount REAL DEFAULT 0');

  // Phase 3 Inventory & Purchases Upgrades
  safeAddColumn('price_change_history', 'item_id INTEGER DEFAULT 0');
  safeAddColumn('price_change_history', 'old_price REAL DEFAULT 0');

  safeAddColumn('purchases_invoices', "paper_invoice_number TEXT DEFAULT ''");
  safeAddColumn('purchases_invoices', "payment_method TEXT DEFAULT 'آجل'");
  safeAddColumn('purchases_invoices', "notes TEXT DEFAULT ''");

  safeAddColumn('purchase_invoice_items', 'bonus_quantity REAL DEFAULT 0');
  safeAddColumn('purchase_invoice_items', 'discount_pct REAL DEFAULT 0');
  safeAddColumn('purchase_invoice_items', "expiry_date TEXT DEFAULT ''");

  safeAddColumn('supplier_transactions', 'invoice_id INTEGER DEFAULT 0');
  safeAddColumn('supplier_transactions', "notes TEXT DEFAULT ''");

  // Phase 4: Work Shifts, Treasury & Customer Ledger
  safeAddColumn('work_shifts', 'user_id INTEGER DEFAULT 1');
  safeAddColumn('work_shifts', 'opening_balance REAL DEFAULT 0');
  safeAddColumn('work_shifts', 'actual_cash_counted REAL');
  safeAddColumn('work_shifts', 'discrepancy REAL DEFAULT 0');
  safeAddColumn('work_shifts', 'cash_sales REAL DEFAULT 0');
  safeAddColumn('work_shifts', 'card_sales REAL DEFAULT 0');
  safeAddColumn('work_shifts', 'credit_sales REAL DEFAULT 0');
  safeAddColumn('work_shifts', 'returns_amount REAL DEFAULT 0');
  safeAddColumn('work_shifts', 'expenses_amount REAL DEFAULT 0');
  safeAddColumn('work_shifts', "notes TEXT DEFAULT ''");

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS customer_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL,
        notes TEXT,
        invoice_number INTEGER
      );
    `);
  } catch {
    // Table created or exists
  }

  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_shortages_item_id ON shortages_drafts(item_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_shortages_supplier_id ON shortages_drafts(supplier_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_shortages_item_name ON shortages_drafts(item_name);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_shortages_id ON shortages_drafts(id DESC);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_purchases_inv_num ON purchases_invoices(purchase_invoice_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases_invoices(supplier_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_purchases_items_inv ON purchase_invoice_items(purchase_invoice_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_purchases_items_item ON purchase_invoice_items(item_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_price_history_item ON price_change_history(item_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_price_history_time ON price_change_history(change_timestamp);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_ledger_date ON general_ledger_2026(entry_date);');
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_unique_doc_account ON general_ledger_2026 (document_ref, account_name);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_shifts_status ON work_shifts(status);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_delivery_status ON delivery_orders(status);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_cust_ledger_cust_id ON customer_ledger(customer_id);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_supp_trans_supp_id ON supplier_transactions(supplier_id);');

    // M1: RBAC Users, Pins & Login Audit Trail
    safeAddColumn('users', "pin_code TEXT DEFAULT ''");
    safeAddColumn('users', "role TEXT DEFAULT 'CASHIER'");
    safeAddColumn('users', `allowed_tabs TEXT DEFAULT '["pos","sales_invoices","shortages"]'`);
    safeAddColumn('users', "badge_barcode TEXT DEFAULT ''");
    safeAddColumn('users', 'max_discount_pct REAL DEFAULT 0');
    safeAddColumn('users', 'commission_pct REAL DEFAULT 0');
    safeAddColumn('sales_invoices', 'user_id INTEGER DEFAULT 99');
    safeAddColumn('sales_invoices', "cashier_name TEXT DEFAULT 'د. مريم الحميلي'");

    database.exec(`
      CREATE TABLE IF NOT EXISTS login_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        action_type TEXT NOT NULL,
        authorized_by_id INTEGER DEFAULT NULL,
        authorized_by_name TEXT DEFAULT '',
        target_ref TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_login_audit_date ON login_audit_log(created_at);
    `);

    // M2: Full Suppliers Ledger & Purchase/Expiry Returns
    safeAddColumn('suppliers', "tax_id TEXT DEFAULT ''");
    safeAddColumn('suppliers', "address TEXT DEFAULT ''");
    safeAddColumn('suppliers', 'credit_limit REAL DEFAULT 0');
    safeAddColumn('suppliers', 'opening_balance REAL DEFAULT 0');

    database.exec(`
      CREATE TABLE IF NOT EXISTS purchase_returns (
        return_id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        supplier_name TEXT NOT NULL,
        original_purchase_id INTEGER DEFAULT 0,
        return_type TEXT NOT NULL,
        settlement_mode TEXT NOT NULL,
        total_cost_value REAL NOT NULL,
        credit_amount REAL NOT NULL,
        expiry_loss_amount REAL DEFAULT 0,
        user_id INTEGER DEFAULT 99,
        cashier_name TEXT DEFAULT 'د. مريم الحميلي',
        notes TEXT DEFAULT '',
        return_date TEXT NOT NULL,
        FOREIGN KEY(supplier_id) REFERENCES suppliers(supplier_id)
      );
      CREATE TABLE IF NOT EXISTS purchase_return_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        line_total REAL NOT NULL,
        expiry_date TEXT DEFAULT '',
        FOREIGN KEY(return_id) REFERENCES purchase_returns(return_id),
        FOREIGN KEY(item_id) REFERENCES items(item_id)
      );
      CREATE INDEX IF NOT EXISTS idx_pur_ret_supp ON purchase_returns(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_pur_ret_items_ret ON purchase_return_items(return_id);
    `);

    // M3: Same-Day Unsave & Edit Sales Invoice + Revisions Log
    safeAddColumn('sales_invoices', 'edit_count INTEGER DEFAULT 0');
    safeAddColumn('sales_invoices', "last_edited_at TEXT DEFAULT ''");
    safeAddColumn('sales_invoices', "last_edited_by TEXT DEFAULT ''");
    safeAddColumn('sales_invoices', 'is_locked INTEGER DEFAULT 0');

    database.exec(`
      CREATE TABLE IF NOT EXISTS invoice_revisions_log (
        revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        revision_number INTEGER NOT NULL,
        edited_by_user_id INTEGER NOT NULL,
        edited_by_user_name TEXT NOT NULL,
        authorized_by_name TEXT DEFAULT '',
        old_total REAL NOT NULL,
        new_total REAL NOT NULL,
        old_payment_method TEXT NOT NULL,
        new_payment_method TEXT NOT NULL,
        old_snapshot_json TEXT NOT NULL,
        new_snapshot_json TEXT NOT NULL,
        reason TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inv_rev_invoice ON invoice_revisions_log(invoice_id);
    `);

    // M4: Smart Pricing, Profit-% Discount, Temp Price & Below-Cost Guard
    safeAddColumn('items', 'temp_price REAL DEFAULT 0');
    safeAddColumn('items', 'temp_price_active INTEGER DEFAULT 0');
    safeAddColumn('sales_invoices', "discount_mode TEXT DEFAULT 'AMOUNT'");
    safeAddColumn('sales_invoices', 'discount_input_value REAL DEFAULT 0');
    safeAddColumn('sales_invoices', "override_manager_name TEXT DEFAULT ''");
    safeAddColumn('sales_invoice_items', "applied_price_source TEXT DEFAULT 'CONSUMER'");

    // M5: Multi-Barcode Mapping Table & Initial Sync
    database.exec(`
      CREATE TABLE IF NOT EXISTS item_barcodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        barcode TEXT NOT NULL UNIQUE,
        label TEXT DEFAULT 'عبوة',
        is_primary INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(item_id) REFERENCES items(item_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_item_barcodes_code ON item_barcodes(barcode);
      CREATE INDEX IF NOT EXISTS idx_item_barcodes_item ON item_barcodes(item_id);
      INSERT OR IGNORE INTO item_barcodes (item_id, barcode, label, is_primary, created_at)
      SELECT item_id, TRIM(barcode), 'باركود أساسي', 1, '2026-11-18'
      FROM items WHERE barcode IS NOT NULL AND TRIM(barcode) != '';
    `);

    // M6: 9-Method Advanced Drug Finder Columns & Idempotent Backfill
    safeAddColumn('items', "short_code TEXT DEFAULT ''");
    safeAddColumn('items', "phonetic_key TEXT DEFAULT ''");
    safeAddColumn('items', "last_sold_at TEXT DEFAULT ''");
    safeAddColumn('items', "last_bought_at TEXT DEFAULT ''");

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_items_short_code ON items(short_code);
      CREATE INDEX IF NOT EXISTS idx_items_phonetic_key ON items(phonetic_key);
    `);

    const missingPhoneticCount = (
      database.prepare("SELECT COUNT(*) as cnt FROM items WHERE phonetic_key IS NULL OR phonetic_key = ''").get() as { cnt: number }
    ).cnt;
    if (missingPhoneticCount > 0) {
      const rows = database
        .prepare("SELECT item_id, item_name_en, item_name_ar FROM items WHERE phonetic_key IS NULL OR phonetic_key = ''")
        .all() as Array<{ item_id: number; item_name_en: string; item_name_ar: string }>;
      const updatePhoneticStmt = database.prepare('UPDATE items SET phonetic_key = ? WHERE item_id = ?');
      const soldRows = database
        .prepare('SELECT item_id, MAX(invoice_date) as last_d FROM sales_invoice_items GROUP BY item_id')
        .all() as Array<{ item_id: number; last_d: string }>;
      const boughtRows = database
        .prepare(`
          SELECT pii.item_id, MAX(pi.invoice_date) as last_d
          FROM purchase_invoice_items pii
          JOIN purchases_invoices pi ON pii.purchase_invoice_id = pi.purchase_invoice_id
          GROUP BY pii.item_id
        `)
        .all() as Array<{ item_id: number; last_d: string }>;
      const updateSoldStmt = database.prepare("UPDATE items SET last_sold_at = ? WHERE item_id = ? AND (last_sold_at IS NULL OR last_sold_at = '')");
      const updateBoughtStmt = database.prepare("UPDATE items SET last_bought_at = ? WHERE item_id = ? AND (last_bought_at IS NULL OR last_bought_at = '')");

      const txBackfill = database.transaction(() => {
        for (const r of rows) {
          const enKey = computePhoneticKey(r.item_name_en || '');
          const arKey = computePhoneticKey(r.item_name_ar || '');
          const combined = arKey ? `${enKey} ${arKey}`.trim() : enKey;
          updatePhoneticStmt.run(combined || String(r.item_id), r.item_id);
        }
        for (const s of soldRows) {
          if (s.last_d) updateSoldStmt.run(s.last_d, s.item_id);
        }
        for (const b of boughtRows) {
          if (b.last_d) updateBoughtStmt.run(b.last_d, b.item_id);
        }
      });
      txBackfill();
    }

    // M7: Per-Supplier Excel/CSV Column Mapping Persistence
    safeAddColumn('suppliers', "excel_column_map_json TEXT DEFAULT ''");

    // M8: Smart Shortages Thresholds, Velocity & Best Supplier Indexes
    safeAddColumn('items', 'min_stock REAL DEFAULT 0');
    safeAddColumn('items', 'max_stock REAL DEFAULT 0');
    safeAddColumn('items', 'auto_reorder INTEGER DEFAULT 1');
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_purchase_items_item_id ON purchase_invoice_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_sales_items_item_id ON sales_invoice_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_sales_items_date_item ON sales_invoice_items(invoice_date, item_id);
    `);

    // M9: Shelf Stocktake, Velocity Expiry Risk, Duplicate Merge & Integrity Monitor
    safeAddColumn('items', "shelf_location TEXT DEFAULT ''");
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_items_shelf_location ON items(shelf_location);
      CREATE TABLE IF NOT EXISTS stocktake_sessions (
        session_id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_label TEXT NOT NULL,
        status TEXT DEFAULT 'OPEN',
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        total_variance_cost REAL DEFAULT 0,
        created_at TEXT NOT NULL,
        posted_at TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS stocktake_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        system_qty REAL NOT NULL,
        counted_qty REAL NOT NULL,
        variance_qty REAL NOT NULL,
        unit_cost REAL NOT NULL,
        variance_cost REAL NOT NULL,
        FOREIGN KEY(session_id) REFERENCES stocktake_sessions(session_id)
      );
      CREATE TABLE IF NOT EXISTS item_merge_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        primary_item_id INTEGER NOT NULL,
        duplicate_item_id INTEGER NOT NULL,
        duplicate_item_name TEXT NOT NULL,
        moved_stock REAL NOT NULL,
        merged_by TEXT NOT NULL,
        merged_at TEXT NOT NULL
      );

      -- M10: Chronic Patients, Insurance Providers & Claims, Drug Interactions
      CREATE TABLE IF NOT EXISTS chronic_patients (
        patient_id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        conditions TEXT DEFAULT '',
        refill_interval_days INTEGER DEFAULT 30,
        last_refill_date TEXT DEFAULT '',
        next_due_date TEXT DEFAULT '',
        notes TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS chronic_patient_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        dosage_notes TEXT DEFAULT '',
        quantity REAL NOT NULL DEFAULT 1,
        FOREIGN KEY(patient_id) REFERENCES chronic_patients(patient_id) ON DELETE CASCADE,
        FOREIGN KEY(item_id) REFERENCES items(item_id)
      );

      CREATE INDEX IF NOT EXISTS idx_chronic_items_patient ON chronic_patient_items(patient_id);

      CREATE TABLE IF NOT EXISTS insurance_providers (
        provider_id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_name TEXT NOT NULL,
        default_copay_pct REAL DEFAULT 20,
        credit_balance REAL DEFAULT 0,
        contact_phone TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS insurance_claims (
        claim_id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        patient_card_number TEXT DEFAULT '',
        patient_name TEXT DEFAULT '',
        total_invoice REAL NOT NULL,
        patient_copay_amount REAL NOT NULL,
        company_claim_amount REAL NOT NULL,
        status TEXT DEFAULT 'PENDING',
        claim_date TEXT NOT NULL,
        paid_date TEXT DEFAULT '',
        FOREIGN KEY(provider_id) REFERENCES insurance_providers(provider_id)
      );

      CREATE INDEX IF NOT EXISTS idx_insurance_claims_provider ON insurance_claims(provider_id);

      CREATE TABLE IF NOT EXISTS drug_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        generic_a TEXT NOT NULL,
        generic_b TEXT NOT NULL,
        severity TEXT NOT NULL,
        clinical_note TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_drug_interactions_ab ON drug_interactions(generic_a, generic_b);
    `);

    // Seed default insurance providers if empty
    const countIns = database.prepare('SELECT count(*) as c FROM insurance_providers').get() as { c: number };
    if (countIns.c === 0) {
      const insertIns = database.prepare('INSERT INTO insurance_providers (provider_name, default_copay_pct, contact_phone, is_active) VALUES (?, ?, ?, 1)');
      insertIns.run('ميدنت (MedNet)', 20, '16444');
      insertIns.run('أكسا للتأمين الطبي (AXA)', 15, '19792');
      insertIns.run('نقابة المهندسين', 10, '0227948333');
      insertIns.run('نقابة الأطباء', 10, '0227943166');
    }

    // Seed default drug interactions if empty
    const countDdi = database.prepare('SELECT count(*) as c FROM drug_interactions').get() as { c: number };
    if (countDdi.c === 0) {
      const insertDdi = database.prepare('INSERT INTO drug_interactions (generic_a, generic_b, severity, clinical_note) VALUES (?, ?, ?, ?)');
      insertDdi.run('warfarin', 'aspirin', 'HIGH', 'خطر نزيف حاد نتيجة التثبيط المزدوج لعوامل التخثر وتثبيط الصفائح الدموية');
      insertDdi.run('aspirin', 'warfarin', 'HIGH', 'خطر نزيف حاد نتيجة التثبيط المزدوج لعوامل التخثر وتثبيط الصفائح الدموية');
      insertDdi.run('sildenafil', 'nitroglycerin', 'HIGH', 'انخفاض حاد وقاتل في ضغط الدم نتيجة فرط توسع الأوعية بتآزر أكسيد النيتريك');
      insertDdi.run('nitroglycerin', 'sildenafil', 'HIGH', 'انخفاض حاد وقاتل في ضغط الدم نتيجة فرط توسع الأوعية بتآزر أكسيد النيتريك');
      insertDdi.run('clarithromycin', 'atorvastatin', 'HIGH', 'خطر انحلال الربيدات (Rhabdomyolysis) وتسمم عضلي حاد نتيجة تثبيط إنزيم CYP3A4');
      insertDdi.run('atorvastatin', 'clarithromycin', 'HIGH', 'خطر انحلال الربيدات (Rhabdomyolysis) وتسمم عضلي حاد نتيجة تثبيط إنزيم CYP3A4');
      insertDdi.run('ciprofloxacin', 'theophylline', 'MODERATE', 'ارتفاع تركيز الثيوفيلين وخطر حدوث تشنجات عصبية لتثبيط CYP1A2');
      insertDdi.run('theophylline', 'ciprofloxacin', 'MODERATE', 'ارتفاع تركيز الثيوفيلين وخطر حدوث تشنجات عصبية لتثبيط CYP1A2');
      insertDdi.run('ibuprofen', 'enalapril', 'MODERATE', 'انخفاض الفعالية الخافضة لضغط الدم وزيادة العبء الكلوي وتثبيط البروستاجلاندين');
      insertDdi.run('enalapril', 'ibuprofen', 'MODERATE', 'انخفاض الفعالية الخافضة لضغط الدم وزيادة العبء الكلوي وتثبيط البروستاجلاندين');
      insertDdi.run('omeprazole', 'clopidogrel', 'MODERATE', 'انخفاض الفعالية المضادة لتكتل الصفائح نتيجة تنافس تثبيط إنزيم CYP2C19');
      insertDdi.run('clopidogrel', 'omeprazole', 'MODERATE', 'انخفاض الفعالية المضادة لتكتل الصفائح نتيجة تنافس تثبيط إنزيم CYP2C19');
    }

    // Ensure Dr. Mariam Elhomeily account exists in users table
    const existingDoctor = database.prepare("SELECT * FROM users WHERE user_name LIKE '%مريم%' OR user_name LIKE '%الحميلي%'").get();
    if (!existingDoctor) {
      const maxUser = database.prepare('SELECT COALESCE(MAX(user_id), 0) as maxId FROM users').get() as { maxId: number };
      database.prepare(`
        INSERT INTO users (user_id, user_name, is_active, permissions_mask)
        VALUES (?, 'د. مريم الحميلي', 1, 8224)
      `).run(maxUser.maxId + 1);
    }

    // Idempotent legacy Titan-3 users cleanup (\x0f removal & active defaults)
    database.exec(`
      UPDATE users SET user_name = TRIM(REPLACE(user_name, char(15), '')) WHERE instr(user_name, char(15)) > 0;
      DELETE FROM users WHERE user_id BETWEEN 5 AND 98 AND (user_name IS NULL OR TRIM(user_name) = '');
      UPDATE users SET is_active = 1, role = 'ADMIN', pin_code = '1989',
        allowed_tabs = '["dashboard","pos","sales_invoices","catalog","purchases","shortages","treasury","reports"]',
        max_discount_pct = 100, badge_barcode = 'EMP-' || user_id
        WHERE user_id IN (2, 99) AND (pin_code IS NULL OR pin_code = '');
      UPDATE users SET is_active = 1, role = 'PHARMACIST', pin_code = '1111',
        allowed_tabs = '["pos","sales_invoices","catalog","purchases","shortages"]',
        max_discount_pct = 10, badge_barcode = 'EMP-3'
        WHERE user_id = 3 AND (pin_code IS NULL OR pin_code = '');
      UPDATE users SET is_active = 1, role = 'CASHIER', pin_code = '2222',
        allowed_tabs = '["pos","sales_invoices","shortages"]',
        max_discount_pct = 3, badge_barcode = 'EMP-4'
        WHERE user_id = 4 AND (pin_code IS NULL OR pin_code = '');
      UPDATE users SET is_active = 0, role = 'ADMIN', pin_code = '9999', badge_barcode = 'EMP-1'
        WHERE user_id = 1 AND (pin_code IS NULL OR pin_code = '');
    `);
  } catch {
    // Indexes exist or table locked
  }
}

export function initDatabase(dbPath?: string): Database.Database {
  if (db) {
    if (
      dbPath &&
      activeDbFilePath &&
      path.resolve(dbPath).toLowerCase() !== path.resolve(activeDbFilePath).toLowerCase()
    ) {
      closeDatabase();
    } else {
      return db;
    }
  }

  let targetPath = dbPath;
  if (!targetPath) {
    const candidatePaths = [
      process.env.PORTABLE_EXECUTABLE_DIR ? path.resolve(process.env.PORTABLE_EXECUTABLE_DIR, 'data', 'pharmacy.sqlite') : '',
      path.resolve(process.cwd(), 'data', 'pharmacy.sqlite'),
      path.resolve(path.dirname(process.execPath), 'data', 'pharmacy.sqlite'),
      path.resolve(process.resourcesPath || '', 'data', 'pharmacy.sqlite'),
      path.resolve(typeof __dirname !== 'undefined' ? __dirname : process.cwd(), '..', 'data', 'pharmacy.sqlite')
    ].filter(Boolean);
    for (const cand of candidatePaths) {
      if (cand && fs.existsSync(cand)) {
        targetPath = cand;
        break;
      }
    }
  }

  const finalPath = targetPath || path.resolve(process.cwd(), 'data', 'pharmacy.sqlite');

  if (!fs.existsSync(finalPath)) {
    throw new Error(`Database file not found at: ${finalPath}`);
  }

  db = new Database(finalPath);
  activeDbFilePath = finalPath;

  // 1. Ultra high-performance PRAGMAs
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB Cache
  db.pragma('mmap_size = 268435456'); // 256MB memory map for instant reads

  // 2. High-speed Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode)',
    'CREATE INDEX IF NOT EXISTS idx_items_name_en ON items(item_name_en)',
    'CREATE INDEX IF NOT EXISTS idx_items_name_ar ON items(item_name_ar)',
    'CREATE INDEX IF NOT EXISTS idx_items_generic ON items(generic_name)',
    'CREATE INDEX IF NOT EXISTS idx_items_stock ON items(current_stock)',
    'CREATE INDEX IF NOT EXISTS idx_sales_inv_num ON sales_invoices(invoice_number)',
    'CREATE INDEX IF NOT EXISTS idx_sales_inv_date ON sales_invoices(invoice_date)',
    'CREATE INDEX IF NOT EXISTS idx_sales_items_inv_num ON sales_invoice_items(invoice_number)',
    'CREATE INDEX IF NOT EXISTS idx_sales_items_item_id ON sales_invoice_items(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_preg_generic ON medical_pregnancy_warnings(generic_name)'
  ];

  for (const idx of indexes) {
    db.exec(idx);
  }

  // 3. Schema Upgrades for Phase 2 POS Columns
  ensureSchemaUpgrades(db);

  // 4. SQLite FTS5 Full-Text Search Virtual Table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      item_id UNINDEXED,
      barcode,
      item_name_en,
      item_name_ar,
      generic_name,
      tokenize='unicode61 remove_diacritics 2'
    );
  `);

  // Check if FTS is populated
  const totalItems = db.prepare('SELECT count(*) as count FROM items').get() as { count: number };
  const ftsCount = db.prepare('SELECT count(*) as count FROM items_fts').get() as { count: number };

  if (ftsCount.count < totalItems.count) {
    db.exec('DELETE FROM items_fts;');
    const insertFts = db.prepare(`
      INSERT INTO items_fts(rowid, item_id, barcode, item_name_en, item_name_ar, generic_name)
      SELECT item_id, item_id, COALESCE(barcode, ''), COALESCE(item_name_en, ''), COALESCE(item_name_ar, ''), COALESCE(generic_name, '')
      FROM items
    `);
    insertFts.run();
  }

  // 5. Startup Accounting Ledger Integrity Check (Double-Entry Balance Assertion)
  checkLedgerIntegrity(db);

  return db;
}

export function getDatabaseInstance(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function getActiveDatabasePath(): string | null {
  return activeDbFilePath;
}

export function closeDatabase(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore if busy or read-only
    }
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    db = null;
    activeDbFilePath = null;
  }
}

export function switchDatabase(newDbPath: string): Database.Database {
  closeDatabase();
  return initDatabase(newDbPath);
}

/**
 * Startup and runtime ledger integrity check (Double-Entry Balance Assertion)
 * Verifies that SUM(debit) == SUM(credit) in general_ledger_2026
 */
export function checkLedgerIntegrity(database?: Database.Database): LedgerIntegrityStatus {
  const d = database || getDatabaseInstance();
  try {
    const row = d.prepare(`
      SELECT ROUND(SUM(debit), 2) as total_debit, ROUND(SUM(credit), 2) as total_credit 
      FROM general_ledger_2026;
    `).get() as { total_debit: number | null; total_credit: number | null } | undefined;

    const totalDebit = Number(row?.total_debit ?? 0);
    const totalCredit = Number(row?.total_credit ?? 0);
    const diff = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;
    const isBalanced = diff <= 0.05;

    if (!isBalanced) {
      const warningMsg = `⚠️ [GL INTEGRITY WARNING] Accounting ledger is out of balance! Debit: ${totalDebit.toFixed(2)} EGP | Credit: ${totalCredit.toFixed(2)} EGP | Imbalance Diff: ${diff.toFixed(2)} EGP`;
      console.warn(warningMsg);
      return {
        balanced: false,
        total_debit: totalDebit,
        total_credit: totalCredit,
        diff,
        message: warningMsg
      };
    } else {
      const successMsg = `✅ [GL INTEGRITY CHECK] Balanced: ${diff.toFixed(2)} EGP diff (Debit: ${totalDebit.toFixed(2)} EGP, Credit: ${totalCredit.toFixed(2)} EGP)`;
      console.log(successMsg);
      return {
        balanced: true,
        total_debit: totalDebit,
        total_credit: totalCredit,
        diff,
        message: successMsg
      };
    }
  } catch (err: unknown) {
    const errMsg = `⚠️ [GL INTEGRITY CHECK] Failed to inspect general_ledger_2026: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(errMsg);
    return {
      balanced: false,
      total_debit: 0,
      total_credit: 0,
      diff: 0,
      message: errMsg
    };
  }
}

/**
 * High-speed search (sub-5ms) for items
 */
function normalizeArabicDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, ch => String(ch.charCodeAt(0) - 0x06F0));
}

function extractBarcodeCandidates(raw: string): string[] {
  const normalized = normalizeArabicDigits(raw)
    .replace(/^](d2|C1|E0|Q3|e0|c1)/i, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();

  if (!normalized) return [];

  const candidates = new Set<string>();
  candidates.add(normalized);

  const addGtinVariants = (gtin: string) => {
    candidates.add(gtin);
    if (gtin.length === 14 && gtin.startsWith('0')) {
      candidates.add(gtin.slice(1));
    }
    const stripped = gtin.replace(/^0+/, '');
    if (stripped.length >= 6) {
      candidates.add(stripped);
    }
  };

  // GS1 DataMatrix with parentheses: (01)06222010611333...
  const parenMatch = normalized.match(/\(01\)(\d{14})/);
  if (parenMatch) {
    addGtinVariants(parenMatch[1]);
  }

  // Raw GS1 DataMatrix without parentheses: 01062220106113331728090010...
  const rawGs1Match = normalized.match(/^01(\d{14})(?:17\d{6}|10|21|$)/);
  if (rawGs1Match) {
    addGtinVariants(rawGs1Match[1]);
  }

  // Pure numeric GTIN-14 / EAN-13 / UPC with possible leading zeros
  if (/^\d{8,14}$/.test(normalized)) {
    addGtinVariants(normalized);
  }

  return Array.from(candidates);
}

function buildDrugSearchScopeAndFilters(filter: AdvancedDrugSearchFilter): {
  whereSql: string;
  params: (string | number)[];
  hasStructuredFilters: boolean;
} {
  const scope: SearchScope = filter.scope || 'ALL';
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  let hasStructuredFilters = false;

  if (scope === 'IN_STOCK') {
    clauses.push('i.current_stock > 0');
  } else if (scope === 'OUR_LIST') {
    clauses.push("(i.current_stock > 0 OR COALESCE(i.min_stock, 0) > 0 OR COALESCE(i.last_bought_at, '') != '' OR COALESCE(i.last_sold_at, '') != '')");
  }

  if (filter.genericName && filter.genericName.trim()) {
    clauses.push("UPPER(COALESCE(i.generic_name, '')) LIKE ?");
    params.push(`%${filter.genericName.trim().toUpperCase()}%`);
    hasStructuredFilters = true;
  }

  if (filter.producer && filter.producer.trim()) {
    clauses.push("UPPER(COALESCE(i.producer, '')) LIKE ?");
    params.push(`%${filter.producer.trim().toUpperCase()}%`);
    hasStructuredFilters = true;
  }

  if (filter.minPrice !== undefined && filter.minPrice !== null && Number.isFinite(Number(filter.minPrice))) {
    clauses.push('i.consumer_price >= ?');
    params.push(Number(filter.minPrice));
    hasStructuredFilters = true;
  }

  if (filter.maxPrice !== undefined && filter.maxPrice !== null && Number.isFinite(Number(filter.maxPrice))) {
    clauses.push('i.consumer_price <= ?');
    params.push(Number(filter.maxPrice));
    hasStructuredFilters = true;
  }

  if (filter.shortCode && filter.shortCode.trim()) {
    clauses.push("UPPER(TRIM(COALESCE(i.short_code, ''))) LIKE ?");
    params.push(`${filter.shortCode.trim().toUpperCase()}%`);
    hasStructuredFilters = true;
  }

  return {
    whereSql: clauses.length > 0 ? clauses.join(' AND ') : '1=1',
    params,
    hasStructuredFilters
  };
}

function searchByFts(
  rawQuery: string,
  scopeWhereSql: string,
  scopeParams: (string | number)[],
  limit: number,
  excludeIds: number[] = []
): Item[] {
  const database = getDatabaseInstance();
  const excludeClause = excludeIds.length > 0
    ? `AND i.item_id NOT IN (${excludeIds.map(() => '?').join(', ')})`
    : '';
  const clean = rawQuery.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, ' ').trim();

  if (clean) {
    const terms = clean.split(/\s+/).filter(Boolean);
    const ftsQuery = terms.map(t => `"${t}"*`).join(' AND ');

    try {
      const ftsSql = `
        SELECT i.*
        FROM items_fts f
        JOIN items i ON f.item_id = i.item_id
        WHERE items_fts MATCH ?
          AND ${scopeWhereSql}
          ${excludeClause}
        ORDER BY
          (CASE WHEN i.current_stock > 0 THEN 0 ELSE 1 END),
          i.item_name_en ASC
        LIMIT ?
      `;
      const ftsResults = database
        .prepare(ftsSql)
        .all(ftsQuery, ...scopeParams, ...excludeIds, limit) as Item[];

      if (ftsResults.length > 0) {
        return ftsResults;
      }
    } catch {
      // If FTS match has syntax quirk, fallback to LIKE
    }
  }

  // Fallback to LIKE if FTS produced 0 results or query contains punctuation
  const pattern = `%${rawQuery.trim()}%`;
  const likeSql = `
    SELECT i.* FROM items i
    WHERE (
      i.item_name_en LIKE ? OR
      i.item_name_ar LIKE ? OR
      COALESCE(i.generic_name, '') LIKE ? OR
      COALESCE(i.producer, '') LIKE ? OR
      COALESCE(i.barcode, '') LIKE ?
    )
      AND ${scopeWhereSql}
      ${excludeClause}
    ORDER BY (CASE WHEN i.current_stock > 0 THEN 0 ELSE 1 END), i.item_name_en ASC
    LIMIT ?
  `;
  return database
    .prepare(likeSql)
    .all(pattern, pattern, pattern, pattern, pattern, ...scopeParams, ...excludeIds, limit) as Item[];
}

export function advancedSearchItems(filter: AdvancedDrugSearchFilter = {}): Item[] {
  const database = getDatabaseInstance();
  const limit = Math.min(200, Math.max(1, Number(filter.limit || 50)));
  const rawQuery = String(filter.query || '');
  const trimmed = normalizeArabicDigits(rawQuery).trim();
  const { whereSql, params: baseParams, hasStructuredFilters } = buildDrugSearchScopeAndFilters(filter);

  // 0. Empty query -> browse filtered items (in-stock prioritized)
  if (!trimmed) {
    return database
      .prepare(`
        SELECT i.* FROM items i
        WHERE ${whereSql}
        ORDER BY (CASE WHEN i.current_stock > 0 THEN 0 ELSE 1 END), i.item_name_en ASC
        LIMIT ?
      `)
      .all(...baseParams, limit) as Item[];
  }

  // Method 3: Barcode Suffix Search (.685 / .1286)
  if (trimmed.startsWith('.') && trimmed.slice(1).trim().length >= 2) {
    const suffix = trimmed.slice(1).trim();
    const suffixLike = `%${suffix}`;
    return database
      .prepare(`
        SELECT i.* FROM items i
        WHERE (
          TRIM(COALESCE(i.barcode, '')) LIKE ? OR
          EXISTS (
            SELECT 1 FROM item_barcodes ib
            WHERE ib.item_id = i.item_id AND TRIM(ib.barcode) LIKE ?
          )
        )
          AND ${whereSql}
        ORDER BY (CASE WHEN i.current_stock > 0 THEN 0 ELSE 1 END), i.item_name_en ASC
        LIMIT ?
      `)
      .all(suffixLike, suffixLike, ...baseParams, limit) as Item[];
  }

  // Method 5: Phonetic / Forgiving Spelling Search (=OJMANTYN / =AGMENTIN)
  if (trimmed.startsWith('=') && trimmed.slice(1).trim().length >= 2) {
    const targetPhonetic = computePhoneticKey(trimmed.slice(1));
    const tokens = targetPhonetic.split(' ').filter(Boolean);
    if (tokens.length > 0) {
      const tokenClauses = tokens.map(() => "COALESCE(i.phonetic_key, '') LIKE ?");
      const tokenParams = tokens.map(t => `%${t}%`);
      const primaryPrefix = `${tokens[0]}%`;
      const phoneticHits = database
        .prepare(`
          SELECT i.* FROM items i
          WHERE ${tokenClauses.join(' AND ')}
            AND ${whereSql}
          ORDER BY
            (CASE WHEN COALESCE(i.phonetic_key, '') LIKE ? THEN 0 ELSE 1 END),
            (CASE WHEN i.current_stock > 0 THEN 0 ELSE 1 END),
            i.item_name_en ASC
          LIMIT ?
        `)
        .all(...tokenParams, ...baseParams, primaryPrefix, limit) as Item[];
      if (phoneticHits.length > 0) {
        return phoneticHits;
      }
    }
    return searchByFts(trimmed.slice(1), whereSql, baseParams, limit);
  }

  // Method 4: Wildcard Search (AU*625, PAN*EXT*)
  if (trimmed.includes('*')) {
    const wildcardPat = toWildcardSqlPattern(trimmed);
    return database
      .prepare(`
        SELECT i.* FROM items i
        WHERE (
          UPPER(TRIM(COALESCE(i.item_name_en, ''))) LIKE UPPER(?) ESCAPE '\\' OR
          TRIM(COALESCE(i.item_name_ar, '')) LIKE ? ESCAPE '\\' OR
          UPPER(TRIM(COALESCE(i.generic_name, ''))) LIKE UPPER(?) ESCAPE '\\'
        )
          AND ${whereSql}
        ORDER BY (CASE WHEN i.current_stock > 0 THEN 0 ELSE 1 END), i.item_name_en ASC
        LIMIT ?
      `)
      .all(wildcardPat, wildcardPat, wildcardPat, ...baseParams, limit) as Item[];
  }

  // Method 9: Exact Barcode & GS1 DataMatrix / GTIN-14 check (items + item_barcodes)
  const barcodeCandidates = extractBarcodeCandidates(rawQuery);
  if (barcodeCandidates.length > 0) {
    const placeholders = barcodeCandidates.map(() => '?').join(', ');
    let barcodeMatch = database
      .prepare(`
        SELECT i.* FROM items i
        WHERE TRIM(COALESCE(i.barcode, '')) IN (${placeholders}) AND ${whereSql}
        LIMIT 1
      `)
      .get(...barcodeCandidates, ...baseParams) as Item | undefined;

    if (!barcodeMatch) {
      barcodeMatch = database
        .prepare(`
          SELECT i.*
          FROM item_barcodes ib
          JOIN items i ON ib.item_id = i.item_id
          WHERE TRIM(ib.barcode) IN (${placeholders}) AND ${whereSql}
          LIMIT 1
        `)
        .get(...barcodeCandidates, ...baseParams) as Item | undefined;
    }
    if (barcodeMatch && !hasStructuredFilters) {
      return [barcodeMatch];
    }
  }

  const prioritized: Item[] = [];
  const seenIds = new Set<number>();

  // Method 6: Pharmacy Short Code exact match
  if (trimmed.length <= 20) {
    const shortMatches = database
      .prepare(`
        SELECT i.* FROM items i
        WHERE UPPER(TRIM(COALESCE(i.short_code, ''))) = UPPER(?)
          AND COALESCE(i.short_code, '') != ''
          AND ${whereSql}
        ORDER BY (CASE WHEN i.current_stock > 0 THEN 0 ELSE 1 END), i.item_name_en ASC
        LIMIT 10
      `)
      .all(trimmed, ...baseParams) as Item[];
    for (const sm of shortMatches) {
      if (!seenIds.has(sm.item_id)) {
        seenIds.add(sm.item_id);
        prioritized.push(sm);
      }
    }
  }

  // Direct Item ID match
  if (/^\d+$/.test(trimmed)) {
    const idMatch = database
      .prepare(`SELECT i.* FROM items i WHERE i.item_id = ? AND ${whereSql} LIMIT 1`)
      .get(parseInt(trimmed, 10), ...baseParams) as Item | undefined;
    if (idMatch && !seenIds.has(idMatch.item_id)) {
      seenIds.add(idMatch.item_id);
      prioritized.push(idMatch);
    }
  }

  if (prioritized.length >= limit) {
    return prioritized.slice(0, limit);
  }

  const rest = searchByFts(
    trimmed,
    whereSql,
    baseParams,
    limit - prioritized.length,
    Array.from(seenIds)
  );
  return [...prioritized, ...rest];
}

export function searchItems(query: string, filterInStockOnly: boolean = false, limit: number = 50): Item[] {
  return advancedSearchItems({
    query,
    scope: filterInStockOnly ? 'IN_STOCK' : 'ALL',
    limit
  });
}

/**
 * DrugEye & Alternatives Engine
 * Returns alternative drugs sharing the same generic_name, ordered by in-stock first then lowest price
 */
export function getAlternatives(itemId: number): Item[] {
  const database = getDatabaseInstance();
  const sourceItem = database.prepare('SELECT item_id, generic_name, consumer_price FROM items WHERE item_id = ?').get(itemId) as Item | undefined;

  if (!sourceItem || !sourceItem.generic_name || sourceItem.generic_name.trim() === '') {
    return [];
  }

  const sql = `
    SELECT * FROM items
    WHERE generic_name = ? AND item_id != ?
    ORDER BY 
      (CASE WHEN current_stock > 0 THEN 0 ELSE 1 END),
      consumer_price ASC
    LIMIT 50
  `;

  return database.prepare(sql).all(sourceItem.generic_name.trim(), itemId) as Item[];
}

/**
 * Medical Alerts & Pregnancy/Schedule Warnings Engine
 */
export function getMedicalAlerts(genericName?: string | null, taxCategory?: number | null): MedicalAlert[] {
  const alerts: MedicalAlert[] = [];
  const database = getDatabaseInstance();

  // 1. Tax Schedule Drug Category (جدول أول / جدول ثانٍ)
  if (taxCategory === 1) {
    alerts.push({
      type: 'schedule',
      severity: 'danger',
      title: 'أدوية الجدول الأول (مخدرات ومؤثرات خاضعة للرقابة)',
      message: 'هذا الصنف مصنف كـ "جدول أول". يحظر صرفه إلا بموجب تذكرة طبية خاصة ومختومة مع القيد الفوري في الدفتر الرسمي للأدوية المخدرة.'
    });
  } else if (taxCategory === 2) {
    alerts.push({
      type: 'schedule',
      severity: 'warning',
      title: 'أدوية الجدول الثاني (أدوية مؤثرة نفسياً / جدول)',
      message: 'هذا الصنف مصنف كـ "جدول ثانٍ". يخضع لضوابط الصرف الرسمية والاحتفاظ بالروشتة الطبية وتسجيل بيانات المريض.'
    });
  }

  // 2. Pregnancy & Trimester Warnings
  if (genericName && genericName.trim() !== '') {
    const rawGenerics = genericName.split(/[\+,;\/]/).map(g => g.trim()).filter(Boolean);
    const lookupGenerics = rawGenerics.length > 0 ? rawGenerics : [genericName.trim()];

    for (const gName of lookupGenerics) {
      const rows = database.prepare(`
        SELECT DISTINCT condition_name 
        FROM medical_pregnancy_warnings 
        WHERE UPPER(generic_name) = UPPER(?) OR UPPER(?) LIKE '%' || UPPER(generic_name) || '%'
      `).all(gName, gName) as { condition_name: string }[];

      for (const row of rows) {
        alerts.push({
          type: 'pregnancy',
          severity: 'danger',
          title: `تحذير الحمل والرضاعة (${gName})`,
          condition: row.condition_name,
          message: `تحذير طبي رسمي: مسجل كخطر خلال (${row.condition_name}). يرجى استشارة الطبيب المعالج والتحقق من بديل آمن تماماً.`
        });
      }
    }
  }

  return alerts;
}

/**
 * Live Dashboard Statistics from pharmacy.sqlite
 */
export function getDashboardStats(): DashboardStats {
  const database = getDatabaseInstance();

  const totalCatalog = (database.prepare('SELECT count(*) as c FROM items').get() as { c: number }).c;
  const inStock = (database.prepare('SELECT count(*) as c FROM items WHERE current_stock > 0').get() as { c: number }).c;
  
  // Treasury cash balance
  let cashBalance = 119242.50;
  try {
    const treasuryRow = database.prepare('SELECT cash_balance FROM treasury_state LIMIT 1').get() as { cash_balance: number } | undefined;
    if (treasuryRow && treasuryRow.cash_balance !== undefined) {
      cashBalance = treasuryRow.cash_balance;
    }
  } catch {
    // Keep extracted balance
  }

  const totalInvoices = (database.prepare('SELECT count(*) as c FROM sales_invoices').get() as { c: number }).c;
  const shortagesCount = (database.prepare('SELECT count(*) as c FROM shortages_drafts').get() as { c: number }).c;
  const suppliersCount = (database.prepare('SELECT count(*) as c FROM suppliers').get() as { c: number }).c;

  const lastInvoice = database.prepare('SELECT invoice_number, invoice_date FROM sales_invoices ORDER BY invoice_number DESC LIMIT 1').get() as { invoice_number: number; invoice_date: string } | undefined;

  return {
    totalCatalogItems: totalCatalog,
    inStockItems: inStock,
    cashBalance,
    totalSalesInvoices: totalInvoices,
    shortagesDraftsCount: shortagesCount,
    suppliersCount,
    lastInvoiceNumber: lastInvoice ? lastInvoice.invoice_number : 864,
    lastInvoiceDate: lastInvoice ? lastInvoice.invoice_date : '2026-10-14'
  };
}

/**
 * Fetch Last N Sales Invoices
 */
export function getRecentSalesInvoices(limit: number = 10): SalesInvoice[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT * FROM sales_invoices
    ORDER BY invoice_number DESC
    LIMIT ?
  `).all(limit) as SalesInvoice[];
}

/**
 * Fetch Items of a specific Sales Invoice
 */
export function getSalesInvoiceItems(invoiceNumber: number): SalesInvoiceItem[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT * FROM sales_invoice_items
    WHERE invoice_number = ?
    ORDER BY line_number ASC
  `).all(invoiceNumber) as SalesInvoiceItem[];
}

function resolveAuthoritativeSaleLinesAndPricing(
  database: Database.Database,
  payload: CreateSaleInvoicePayload,
  opts?: { requesterId?: number; requesterRole?: UserRole; targetRef?: string; skipOverrideAuditIfAlreadyVerified?: boolean }
): {
  totalSellingPrice: number;
  totalCostPrice: number;
  discount: number;
  netTotal: number;
  profit: number;
  discountMode: DiscountMode;
  discountInputValue: number;
  overrideManagerName: string;
} {
  const getItemPricingStmt = database.prepare(`
    SELECT item_id, item_name_en, consumer_price, temp_price, temp_price_active,
           buy_price, discount_pct, pharmacy_discount_percent, package_units
    FROM items WHERE item_id = ?
  `);

  for (const item of payload.items) {
    const itemDb = getItemPricingStmt.get(item.item_id) as {
      item_id: number;
      item_name_en: string;
      consumer_price: number;
      temp_price?: number | null;
      temp_price_active?: number;
      buy_price: number;
      discount_pct: number;
      pharmacy_discount_percent: number;
      package_units: number;
    } | undefined;

    if (!itemDb) {
      throw new Error(`الصنف رقم #${item.item_id} غير موجود في قاعدة البيانات.`);
    }

    const pkgUnits = itemDb.package_units && itemDb.package_units > 1 ? itemDb.package_units : 1;
    item.package_units = pkgUnits;

    const useTempPrice =
      item.applied_price_source === 'TEMP_PRICE' &&
      Number(itemDb.temp_price_active || 0) === 1 &&
      Number(itemDb.temp_price || 0) > 0;
    const basePackPrice = useTempPrice ? Number(itemDb.temp_price) : itemDb.consumer_price;
    item.applied_price_source = useTempPrice ? 'TEMP_PRICE' : 'CONSUMER';

    const unitPrice =
      item.unit_type === 'unit'
        ? Math.round((basePackPrice / pkgUnits) * 100) / 100
        : basePackPrice;
    item.unit_price = unitPrice;

    const discPct = Math.min(100, Math.max(0, Number(item.discount_pct || 0)));
    item.discount_pct = discPct;
    item.line_total = Math.round(item.quantity * unitPrice * (1 - discPct / 100) * 100) / 100;

    const cp = itemDb.consumer_price || unitPrice;
    const bp = itemDb.buy_price || 0;
    const disc =
      itemDb.discount_pct && itemDb.discount_pct > 0
        ? itemDb.discount_pct
        : itemDb.pharmacy_discount_percent && itemDb.pharmacy_discount_percent > 0
          ? itemDb.pharmacy_discount_percent
          : 25;

    const effectivePackCost =
      bp <= 0 || bp < cp * 0.35 ? Math.round(cp * (1.0 - disc / 100.0) * 100) / 100 : bp;
    const effectiveCost =
      item.unit_type === 'unit' && pkgUnits > 1
        ? Math.round((effectivePackCost / pkgUnits) * 100) / 100
        : effectivePackCost;

    item.cost_price = effectiveCost;
  }

  const mode: DiscountMode = payload.discount_mode || 'AMOUNT';
  const rawInput =
    payload.discount_mode !== undefined
      ? Number(payload.discount_input_value ?? payload.discount ?? 0)
      : Number(payload.discount ?? 0);

  const pricing = calculateInvoicePricing(payload.items, mode, rawInput);

  const requesterId = opts?.requesterId ?? (payload.user_id && payload.user_id > 0 ? payload.user_id : 99);
  let effectiveRole: UserRole = 'ADMIN';
  let roleMaxDiscountPct = 100;

  if (opts?.requesterRole || payload.user_role) {
    effectiveRole = opts?.requesterRole || payload.user_role || 'ADMIN';
    roleMaxDiscountPct = effectiveRole === 'CASHIER' ? 3 : effectiveRole === 'PHARMACIST' ? 10 : 100;
  } else if (payload.user_id && payload.user_id > 0) {
    const uRow = database
      .prepare('SELECT role, max_discount_pct FROM users WHERE user_id = ?')
      .get(payload.user_id) as { role?: string; max_discount_pct?: number } | undefined;
    if (uRow?.role === 'CASHIER' || uRow?.role === 'PHARMACIST' || uRow?.role === 'ADMIN') {
      effectiveRole = uRow.role;
      roleMaxDiscountPct = Number(uRow.max_discount_pct ?? (effectiveRole === 'CASHIER' ? 3 : 10));
    }
  }

  let overrideManagerName = (payload.override_manager_name || '').trim();

  if ((pricing.isBelowCost || mode === 'WHOLESALE_COST') && effectiveRole !== 'ADMIN') {
    if (!payload.manager_override_pin) {
      throw new Error(
        'BELOW_COST_REQUIRES_MANAGER_OVERRIDE: لا يمكن البيع بأقل من التكلفة أو بسعر الشراء بدون تفويض المدير.'
      );
    }
    if (!opts?.skipOverrideAuditIfAlreadyVerified) {
      const auth = verifyManagerOverride(
        payload.manager_override_pin,
        requesterId,
        'البيع بسعر التكلفة أو أقل',
        opts?.targetRef || ''
      );
      overrideManagerName = auth.managerName;
    }
  } else if (effectiveRole === 'CASHIER' && pricing.effectiveDiscountPct > roleMaxDiscountPct + 0.01) {
    if (!payload.manager_override_pin) {
      throw new Error(
        `DISCOUNT_EXCEEDS_ROLE_LIMIT: نسبة الخصم (${pricing.effectiveDiscountPct}%) تتجاوز الحد المسموح للكاشير (${roleMaxDiscountPct}%) بدون تفويض المدير.`
      );
    }
    if (!opts?.skipOverrideAuditIfAlreadyVerified) {
      const auth = verifyManagerOverride(
        payload.manager_override_pin,
        requesterId,
        'تجاوز حد خصم الكاشير',
        opts?.targetRef || ''
      );
      overrideManagerName = auth.managerName;
    }
  }

  return {
    totalSellingPrice: pricing.subtotal,
    totalCostPrice: pricing.totalCost,
    discount: pricing.discountAmount,
    netTotal: pricing.netTotal,
    profit: pricing.profit,
    discountMode: pricing.discountMode,
    discountInputValue: pricing.discountInputValue,
    overrideManagerName
  };
}

/**
 * Phase 2 POS: Create Sales Invoice (Atomic SQLite Transaction)
 */
export function createSaleInvoice(payload: CreateSaleInvoicePayload): CreateSaleInvoiceResult {
  const database = getDatabaseInstance();

  if (!payload.items || payload.items.length === 0) {
    throw new Error('لا يمكن حفظ فاتورة بدون أصناف.');
  }

  // Validate item basic integrity before starting transaction
  for (const item of payload.items) {
    if (!item.item_id || item.item_id <= 0) {
      throw new Error('معرف الصنف غير صالح.');
    }
    if (!item.quantity || item.quantity <= 0 || isNaN(item.quantity)) {
      throw new Error('كمية الصنف يجب أن تكون أكبر من الصفر.');
    }
  }

  if (payload.payment_method === 'آجل') {
    if (!payload.client_name || !payload.client_name.trim()) {
      throw new Error('يجب تحديد اسم العميل للمبيعات الآجلة.');
    }
  }

  const tx = database.transaction(() => {
    // 1. Next invoice number (starts at #865 if current max is #864)
    const maxRow = database.prepare('SELECT COALESCE(MAX(invoice_number), 864) as maxNum FROM sales_invoices').get() as { maxNum: number };
    const invoiceNumber = maxRow.maxNum + 1;

    // Date & Timestamp (True Local Time)
    const local = getLocalDateTime();
    const invoiceDate = local.date;
    const invoiceTime = local.time;
    const fullTimestamp = local.timestamp;
    const year = local.year;

    // 2. Authoritative pricing, discount mode & below-cost/role guard
    const resolved = resolveAuthoritativeSaleLinesAndPricing(database, payload, {
      targetRef: `INV-${invoiceNumber}`
    });
    const {
      totalSellingPrice,
      totalCostPrice,
      discount,
      netTotal,
      profit,
      discountMode,
      discountInputValue,
      overrideManagerName
    } = resolved;

    // Paid amount & change validation
    const paid = payload.paid_amount !== undefined && payload.paid_amount !== null ? payload.paid_amount : netTotal;
    if ((payload.payment_method === 'نقدي' || payload.payment_method === 'دليفري') && paid + 0.001 < netTotal) {
      throw new Error(`المبلغ المدفوع (${paid} ج.م) أقل من إجمالي الفاتورة المطلوبة (${netTotal} ج.م).`);
    }
    const change = Math.max(0, Math.round((paid - netTotal) * 100) / 100);

    // 3. Insert sales_invoices Header
    const cashierId = payload.user_id && payload.user_id > 0 ? payload.user_id : 99;
    const cashierName = payload.cashier_name && payload.cashier_name.trim()
      ? payload.cashier_name.trim()
      : 'د. مريم الحميلي';

    database.prepare(`
      INSERT INTO sales_invoices (
        invoice_number, invoice_date, invoice_time, item_count,
        total_selling_price, total_cost_price, profit, year,
        discount, discount_mode, discount_input_value, override_manager_name,
        payment_method, client_name, client_phone, client_address, notes,
        user_id, cashier_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNumber,
      invoiceDate,
      fullTimestamp,
      payload.items.length,
      totalSellingPrice,
      totalCostPrice,
      profit,
      year,
      discount,
      discountMode,
      discountInputValue,
      overrideManagerName,
      payload.payment_method,
      payload.client_name || '',
      payload.client_phone || '',
      payload.client_address || '',
      payload.notes || '',
      cashierId,
      cashierName
    );

    // 4. Insert items, deduct stock, feed shortages_drafts
    const maxItemRow = database.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM sales_invoice_items').get() as { maxId: number };
    let currentItemId = maxItemRow.maxId;

    const maxShortageRow = database.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM shortages_drafts').get() as { maxId: number };
    let currentShortageId = maxShortageRow.maxId;

    const insertItemStmt = database.prepare(`
      INSERT INTO sales_invoice_items (
        id, invoice_number, line_number, item_id, item_name, quantity, unit_price, discount_pct, line_total, invoice_date, invoice_time, unit_type, cost_price, applied_price_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStockStmt = database.prepare(`
      UPDATE items SET current_stock = ROUND(current_stock - ?, 4), last_sold_at = ? WHERE item_id = ?
    `);

    const checkShortageStmt = database.prepare(`
      SELECT count(*) as count FROM shortages_drafts WHERE item_id = ?
    `);

    const insertShortageStmt = database.prepare(`
      INSERT INTO shortages_drafts (id, supplier_id, supplier_name, item_id, item_name, quantity, order_code)
      VALUES (?, 1, 'الشراء من غير الموردين', ?, ?, 1, '')
    `);

    let lineNumber = 1;
    for (const item of payload.items) {
      currentItemId++;
      insertItemStmt.run(
        currentItemId,
        invoiceNumber,
        lineNumber++,
        item.item_id,
        item.item_name,
        item.quantity,
        item.unit_price,
        item.discount_pct || 0,
        item.line_total,
        invoiceDate,
        fullTimestamp,
        item.unit_type === 'unit' ? 'شريط' : 'عبوة',
        item.cost_price || 0,
        item.applied_price_source || 'CONSUMER'
      );

      // Fractional or pack deduction
      let deductQty = item.quantity;
      if (item.unit_type === 'unit') {
        const pkgUnits = item.package_units && item.package_units > 1 ? item.package_units : 1;
        deductQty = Math.round((item.quantity / pkgUnits) * 10000) / 10000;
      }

      updateStockStmt.run(deductQty, invoiceDate, item.item_id);

      // Check stock after sale -> auto shortage draft
      const currentStockRow = database.prepare('SELECT current_stock, item_name_en FROM items WHERE item_id = ?').get(item.item_id) as { current_stock: number; item_name_en: string } | undefined;
      if (currentStockRow && currentStockRow.current_stock <= 0) {
        const existing = checkShortageStmt.get(item.item_id) as { count: number };
        if (existing.count === 0) {
          currentShortageId++;
          insertShortageStmt.run(currentShortageId, item.item_id, currentStockRow.item_name_en);
        }
      }
    }

    // 5. Insurance Copay & Claims Calculation
    let patientCopayAmount = netTotal;
    let companyClaimAmount = 0;
    let insuranceProviderName = '';

    if (payload.insurance_provider_id && payload.insurance_provider_id > 0) {
      const provider = database
        .prepare('SELECT provider_id, provider_name, default_copay_pct FROM insurance_providers WHERE provider_id = ?')
        .get(payload.insurance_provider_id) as { provider_id: number; provider_name: string; default_copay_pct: number } | undefined;
      if (provider) {
        insuranceProviderName = provider.provider_name;
        const copayPct = (typeof payload.insurance_copay_pct === 'number' && payload.insurance_copay_pct >= 0)
          ? payload.insurance_copay_pct
          : (provider.default_copay_pct ?? 20);
        patientCopayAmount = Math.round((netTotal * (copayPct / 100)) * 100) / 100;
        companyClaimAmount = Math.round((netTotal - patientCopayAmount) * 100) / 100;

        database.prepare(`
          UPDATE insurance_providers
          SET credit_balance = ROUND(credit_balance + ?, 2)
          WHERE provider_id = ?
        `).run(companyClaimAmount, provider.provider_id);

        database.prepare(`
          INSERT INTO insurance_claims (
            provider_id, invoice_id, patient_card_number, patient_name,
            total_invoice, patient_copay_amount, company_claim_amount,
            status, claim_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `).run(
          provider.provider_id,
          invoiceNumber,
          payload.patient_card_number || '',
          payload.client_name || '',
          netTotal,
          patientCopayAmount,
          companyClaimAmount,
          fullTimestamp
        );
      }
    }

    // 6. Chronic Patient Refill Interval Update
    if (payload.chronic_patient_id && payload.chronic_patient_id > 0) {
      database.prepare(`
        UPDATE chronic_patients
        SET last_refill_date = ?,
            next_due_date = date(?, '+' || COALESCE(NULLIF(refill_interval_days, 0), 30) || ' days')
        WHERE patient_id = ?
      `).run(invoiceDate, invoiceDate, payload.chronic_patient_id);
    }

    // 7. Update Treasury State
    if (payload.payment_method === 'نقدي' || payload.payment_method === 'دليفري') {
      database.prepare(`
        UPDATE treasury_state
        SET cash_balance = ROUND(cash_balance + ?, 2), last_updated = ?
        WHERE id = 1
      `).run(patientCopayAmount, fullTimestamp);
    }

    // 8. Balanced Double-Entry Accounting Ledger in general_ledger_2026
    try {
      const debitAccount = getSalePaymentGlAccount(payload.payment_method);
      if (companyClaimAmount > 0) {
        postBalancedGlLines(database, invoiceDate, `INV-${invoiceNumber}`, [
          {
            account_name: debitAccount,
            notes: `تحمل مريض تأمين (${insuranceProviderName}) فاتورة #${invoiceNumber}`,
            debit: patientCopayAmount,
            credit: 0
          },
          {
            account_name: 'اصول.متداولة.ذمم شركات تامين',
            notes: `مطالبة شركة تأمين (${insuranceProviderName}) فاتورة #${invoiceNumber}`,
            debit: companyClaimAmount,
            credit: 0
          },
          {
            account_name: 'ايرادات.مبيعات',
            notes: `إيراد مبيعات تأمين فاتورة #${invoiceNumber}`,
            debit: 0,
            credit: netTotal
          }
        ]);
      } else {
        postBalancedGlLines(database, invoiceDate, `INV-${invoiceNumber}`, [
          {
            account_name: debitAccount,
            notes: `مبيعات ${payload.payment_method} فاتورة #${invoiceNumber}`,
            debit: netTotal,
            credit: 0
          },
          {
            account_name: 'ايرادات.مبيعات',
            notes: `إيراد مبيعات فاتورة #${invoiceNumber}`,
            debit: 0,
            credit: netTotal
          }
        ]);
      }
    } catch (glErr: unknown) {
      console.error('Error posting sales invoice to general_ledger_2026:', glErr);
    }

    // 7. Delivery Orders logging
    if (payload.payment_method === 'دليفري' || payload.is_delivery) {
      const maxOrderRow = database.prepare('SELECT COALESCE(MAX(order_id), 0) as maxId FROM delivery_orders').get() as { maxId: number };
      const newOrderId = maxOrderRow.maxId + 1;
      const itemSummary = payload.items.map(i => `${i.item_name} (${i.quantity} ${i.unit_type === 'unit' ? 'شريط' : 'عبوة'})`).join(', ');

      database.prepare(`
        INSERT INTO delivery_orders (
          order_id, item_ordered, order_timestamp, status, customer_name, phone, address, invoice_number, total_amount
        ) VALUES (?, ?, ?, 'قيد التوصيل', ?, ?, ?, ?, ?)
      `).run(
        newOrderId,
        itemSummary.slice(0, 250),
        fullTimestamp,
        payload.client_name || '',
        payload.client_phone || '',
        payload.client_address || '',
        invoiceNumber,
        netTotal
      );
    }

    // 8. If Credit Account (آجل), update customer balance and ledger
    if (payload.payment_method === 'آجل' && payload.client_name && payload.client_name.trim()) {
      const clientName = payload.client_name.trim();
      let cust = database.prepare('SELECT customer_id, customer_name, account_balance FROM customers WHERE customer_name = ?').get(clientName) as { customer_id: number; customer_name: string; account_balance: number } | undefined;
      if (!cust) {
        const maxCust = database.prepare('SELECT COALESCE(MAX(customer_id), 0) as maxId FROM customers').get() as { maxId: number };
        const newCustId = maxCust.maxId + 1;
        database.prepare(`
          INSERT INTO customers (customer_id, customer_name, phone, address, account_balance)
          VALUES (?, ?, ?, ?, ?)
        `).run(newCustId, clientName, payload.client_phone || '', payload.client_address || '', netTotal);
        cust = { customer_id: newCustId, customer_name: clientName, account_balance: netTotal };
      } else {
        database.prepare(`
          UPDATE customers 
          SET account_balance = ROUND(account_balance + ?, 2)
          WHERE customer_id = ?
        `).run(netTotal, cust.customer_id);
      }

      database.prepare(`
        INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, notes, invoice_number)
        VALUES (?, ?, 'SALE', ?, ?, ?)
      `).run(cust.customer_id, fullTimestamp, netTotal, `فاتورة مبيعات آجل #${invoiceNumber}`, invoiceNumber);
    }

    return {
      success: true,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      invoice_time: invoiceTime,
      total_selling_price: totalSellingPrice,
      total_cost_price: totalCostPrice,
      profit,
      discount,
      payment_method: payload.payment_method,
      item_count: payload.items.length,
      change,
      items: payload.items,
      client_name: payload.client_name,
      client_phone: payload.client_phone,
      client_address: payload.client_address,
      patient_copay_amount: patientCopayAmount,
      company_claim_amount: companyClaimAmount,
      insurance_provider_name: insuranceProviderName
    };
  });

  return tx();
}

/**
 * Phase 2 POS: Return Sales Invoice (Refund & Stock Restore Transaction)
 * Hardened for accurate partial/full returns, proportional discount deduction, and payment method reversal.
 */
export function returnSaleInvoice(invoiceNumber: number, itemsToReturn?: ReturnItemPayload[]): ReturnSaleInvoiceResult {
  const database = getDatabaseInstance();

  const invoice = database.prepare('SELECT * FROM sales_invoices WHERE invoice_number = ?').get(invoiceNumber) as SalesInvoice | undefined;
  if (!invoice) {
    throw new Error(`الفاتورة رقم #${invoiceNumber} غير موجودة.`);
  }

  const tx = database.transaction(() => {
    const local = getLocalDateTime();
    const invoiceDate = local.date;
    const invoiceTime = local.time;
    const timestamp = local.timestamp;

    const originalItems = database.prepare('SELECT * FROM sales_invoice_items WHERE invoice_number = ?').all(invoiceNumber) as any[];
    if (!originalItems || originalItems.length === 0) {
      throw new Error(`لا توجد بنود مسجلة للفاتورة رقم #${invoiceNumber}.`);
    }

    // Invoice-level discount ratio for proportional discount allocation
    const subtotal = Number(invoice.total_selling_price || 0);
    const invDiscount = Math.max(0, Number(invoice.discount || 0));
    const discountRatio = (subtotal > 0 && invDiscount > 0) ? Math.max(0, (subtotal - invDiscount) / subtotal) : 1;

    let items = itemsToReturn;
    if (!items || items.length === 0) {
      // Default: Return all remaining unreturned items
      items = originalItems
        .filter(i => (i.quantity - (i.returned_quantity || 0)) > 0.0001)
        .map(i => ({
          invoice_item_id: i.id,
          item_id: i.item_id,
          item_name: i.item_name,
          quantity: Math.round((i.quantity - (i.returned_quantity || 0)) * 10000) / 10000,
          unit_type: (i.unit_type === 'شريط' ? 'unit' : 'pack') as 'pack' | 'unit',
          package_units: 1,
          unit_price: i.unit_price
        }));
    }

    if (items.length === 0) {
      throw new Error(`تم إرجاع جميع بنود الفاتورة رقم #${invoiceNumber} بالكامل مسبقاً.`);
    }

    // 1. Strict validation: match exact invoice line (supporting same item_id on multiple lines)
    // and prevent exceeding sold/remaining quantities
    const matchedLineIds = new Set<number>();
    const resolvedReturnRows: Array<{ item: ReturnItemPayload; orig: any }> = [];

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new Error(`الكمية المراد إرجاعها للصنف "${item.item_name}" يجب أن تكون أكبر من الصفر.`);
      }

      let orig = item.invoice_item_id
        ? originalItems.find(o => o.id === item.invoice_item_id)
        : undefined;

      if (!orig) {
        orig = originalItems.find(
          o => o.item_id === item.item_id && !matchedLineIds.has(o.id) && (o.quantity - (o.returned_quantity || 0)) > 0.0001
        ) || originalItems.find(
          o => o.item_id === item.item_id && !matchedLineIds.has(o.id)
        ) || originalItems.find(o => o.item_id === item.item_id);
      }

      if (!orig) {
        throw new Error(`الصنف "${item.item_name}" (كود: ${item.item_id}) غير موجود في الفاتورة الأصلية رقم #${invoiceNumber}.`);
      }

      const alreadyReturned = Number(orig.returned_quantity || 0);
      const remaining = Math.round((orig.quantity - alreadyReturned) * 10000) / 10000;
      if (item.quantity > remaining + 0.0001) {
        throw new Error(`الكمية المراد إرجاعها (${item.quantity}) تتجاوز الكمية المتبقية القابلة للإرجاع (${remaining}) للصنف "${item.item_name}".`);
      }

      matchedLineIds.add(orig.id);
      resolvedReturnRows.push({ item, orig });
    }

    // 2. Prepare database statements
    const updateInvoiceItemStmt = database.prepare(`
      UPDATE sales_invoice_items 
      SET returned_quantity = ROUND(COALESCE(returned_quantity, 0) + ?, 4)
      WHERE id = ?
    `);

    const updateStockStmt = database.prepare(`
      UPDATE items SET current_stock = ROUND(current_stock + ?, 4) WHERE item_id = ?
    `);

    const insertSalesReturnStmt = database.prepare(`
      INSERT INTO sales_returns (
        invoice_number, line_number, item_id, item_name, unit_type,
        quantity, unit_price, discount_pct, effective_unit_price, refund_amount,
        payment_method, return_date, return_time, return_timestamp, user_name, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertUndoStmt = database.prepare(`
      INSERT INTO undo_sales_history (
        id, sale_timestamp, user_name, item_name, unit_price, fraction, package_unit, invoice_id
      ) VALUES (?, ?, 'مدير الصيدلية', ?, ?, ?, ?, ?)
    `);

    const getItemPkgUnitsStmt = database.prepare('SELECT package_units FROM items WHERE item_id = ?');
    const maxUndoRow = database.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM undo_sales_history').get() as { maxId: number };
    let currentUndoId = maxUndoRow.maxId;

    let totalRefund = 0;
    const paymentMethod = invoice.payment_method || 'نقدي';

    // 3. Process each item refund & stock restoration
    for (const { item, orig } of resolvedReturnRows) {
      const dbItem = getItemPkgUnitsStmt.get(item.item_id) as { package_units: number } | undefined;
      const pkgUnits = (orig.unit_type === 'شريط' || item.unit_type === 'unit')
        ? (dbItem?.package_units && dbItem.package_units > 1 ? dbItem.package_units : (orig.package_units || 1))
        : 1;

      // Calculate net unit price taking into account line discount & proportional invoice discount
      const origLineTotal = Number(orig.line_total || (orig.quantity * orig.unit_price * (1 - (orig.discount_pct || 0) / 100)));
      const netLineTotal = Math.round(origLineTotal * discountRatio * 100) / 100;
      const effectiveUnitPrice = orig.quantity > 0 ? Math.round((netLineTotal / orig.quantity) * 100) / 100 : orig.unit_price;
      const itemRefund = Math.round(item.quantity * effectiveUnitPrice * 100) / 100;
      totalRefund += itemRefund;

      // Calculate stock units to restore (fractional if unit/strip)
      let restoreQty = item.quantity;
      let fraction = 0;
      if (item.unit_type === 'unit' || orig.unit_type === 'شريط') {
        const units = pkgUnits > 0 ? pkgUnits : 1;
        restoreQty = Math.round((item.quantity / units) * 10000) / 10000;
        fraction = item.quantity;
      }

      updateStockStmt.run(restoreQty, item.item_id);
      updateInvoiceItemStmt.run(item.quantity, orig.id);

      insertSalesReturnStmt.run(
        invoiceNumber,
        orig.line_number || null,
        item.item_id,
        item.item_name,
        orig.unit_type || 'عبوة',
        item.quantity,
        orig.unit_price,
        orig.discount_pct || 0,
        effectiveUnitPrice,
        itemRefund,
        paymentMethod,
        invoiceDate,
        invoiceTime,
        timestamp,
        'مدير الصيدلية',
        `مرتجع مبيعات فاتورة #${invoiceNumber}`
      );

      currentUndoId++;
      insertUndoStmt.run(
        currentUndoId,
        timestamp,
        item.item_name,
        effectiveUnitPrice,
        fraction,
        pkgUnits,
        invoiceNumber
      );
    }

    totalRefund = Math.round(totalRefund * 100) / 100;

    // 4. Financial Reversal based on original payment_method (C2)
    let refundMethodDescription = 'نقداً من الخزينة';

    if (paymentMethod === 'آجل') {
      refundMethodDescription = 'خصم من رصيد حساب العميل';
      if (invoice.client_name && invoice.client_name.trim() !== '') {
        const cust = database.prepare('SELECT customer_id, customer_name, account_balance FROM customers WHERE customer_name = ?').get(invoice.client_name.trim()) as Customer | undefined;
        if (cust) {
          database.prepare(`
            UPDATE customers 
            SET account_balance = ROUND(account_balance - ?, 2) 
            WHERE customer_id = ?
          `).run(totalRefund, cust.customer_id);

          database.prepare(`
            INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, notes, invoice_number)
            VALUES (?, ?, 'RETURN', ?, ?, ?)
          `).run(cust.customer_id, invoiceDate, -totalRefund, `مرتجع مبيعات فاتورة آجل #${invoiceNumber}`, invoiceNumber);
        }
      }
    } else if (paymentMethod === 'نقدي' || paymentMethod === 'دليفري') {
      refundMethodDescription = 'نقداً وخصمها من الخزينة';
      database.prepare(`
        UPDATE treasury_state
        SET cash_balance = ROUND(cash_balance - ?, 2), last_updated = ?
        WHERE id = 1
      `).run(totalRefund, timestamp);
    } else {
      // 'فيزا' or 'محفظة / إنستاباي'
      refundMethodDescription = 'مرتجع بنكي / إلكتروني';
    }

    // 5. Balanced Double-Entry General Ledger (C5 & C6)
    try {
      const maxEntryRow = database.prepare('SELECT COALESCE(MAX(entry_id), 0) as maxId FROM general_ledger_2026').get() as { maxId: number };
      const newEntryId = maxEntryRow.maxId + 1;
      const glCount = (database.prepare("SELECT count(DISTINCT document_ref) as c FROM general_ledger_2026 WHERE document_ref LIKE ?").get(`RET-INV-${invoiceNumber}%`) as { c: number }).c;
      const docRef = glCount === 0 ? `RET-INV-${invoiceNumber}` : `RET-INV-${invoiceNumber}-${glCount + 1}`;

      const creditAccount = (paymentMethod === 'آجل')
        ? 'اصول.متداولة.عملاء'
        : ((paymentMethod === 'فيزا' || paymentMethod === 'محفظة / إنستاباي')
          ? 'اصول.متداولة.بنك.فيزا'
          : 'اصول.متداولة.نقدية.كاش');

      // 1. Debit Sales Returns (مردودات مبيعات)
      database.prepare(`
        INSERT INTO general_ledger_2026 (
          entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit
        ) VALUES (?, ?, 'ايرادات.مبيعات.مردودات', ?, ?, ?, ?, 0)
      `).run(
        newEntryId,
        invoiceDate,
        docRef,
        `مرتجع مبيعات فاتورة #${invoiceNumber} (${refundMethodDescription})`,
        totalRefund,
        totalRefund
      );

      // 2. Credit Asset / Cash / Receivable
      database.prepare(`
        INSERT INTO general_ledger_2026 (
          entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        newEntryId + 1,
        invoiceDate,
        creditAccount,
        docRef,
        `تسوية مرتجع فاتورة #${invoiceNumber}`,
        -totalRefund,
        totalRefund
      );
    } catch (glErr: unknown) {
      console.error('Error posting return invoice to general_ledger_2026:', glErr);
    }

    // 6. Annotate invoice notes
    database.prepare(`
      UPDATE sales_invoices
      SET notes = COALESCE(notes, '') || ' [مرتجع بمبلغ ' || ? || ' ج.م (' || ? || ') بتوقيت ' || ? || ']'
      WHERE invoice_number = ?
    `).run(totalRefund, refundMethodDescription, timestamp, invoiceNumber);

    return {
      success: true,
      invoice_number: invoiceNumber,
      total_refunded: totalRefund,
      items_returned_count: items.length,
      payment_method: paymentMethod,
      message: `تم إرجاع ${items.length} صنف واسترداد ${totalRefund.toFixed(2)} ج.م (${refundMethodDescription}) بنجاح.`
    };
  });

  return tx();
}

/**
 * Customers management
 */
export function getCustomers(query: string = ''): Customer[] {
  const database = getDatabaseInstance();
  const trimmed = query.trim();
  if (!trimmed) {
    return database.prepare('SELECT * FROM customers ORDER BY customer_name ASC LIMIT 50').all() as Customer[];
  }
  const pattern = `%${trimmed}%`;
  return database.prepare(`
    SELECT * FROM customers
    WHERE customer_name LIKE ? OR phone LIKE ?
    ORDER BY customer_name ASC
    LIMIT 50
  `).all(pattern, pattern) as Customer[];
}

export function addCustomer(name: string, phone: string = '', address: string = ''): Customer {
  const database = getDatabaseInstance();
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('اسم العميل مطلوب.');
  }

  const tx = database.transaction(() => {
    const maxRow = database.prepare('SELECT COALESCE(MAX(customer_id), 0) as maxId FROM customers').get() as { maxId: number };
    const newId = maxRow.maxId + 1;

    database.prepare(`
      INSERT INTO customers (customer_id, customer_name, phone, address, account_balance)
      VALUES (?, ?, ?, ?, 0)
    `).run(newId, trimmedName, phone.trim(), address.trim());

    return {
      customer_id: newId,
      customer_name: trimmedName,
      phone: phone.trim(),
      address: address.trim(),
      account_balance: 0
    };
  });

  return tx();
}

/**
 * Quick return invoice lookup enriched with already returned quantities,
 * remaining quantities, and net effective unit prices with discounts accounted for.
 */
export function getInvoiceForReturn(invoiceNumber: number): { 
  invoice: SalesInvoice; 
  items: SalesInvoiceItem[];
  is_fully_returned?: boolean;
} | null {
  const database = getDatabaseInstance();
  const invoice = database.prepare('SELECT * FROM sales_invoices WHERE invoice_number = ?').get(invoiceNumber) as SalesInvoice | undefined;
  if (!invoice) return null;

  const rawItems = database.prepare('SELECT * FROM sales_invoice_items WHERE invoice_number = ? ORDER BY line_number ASC').all(invoiceNumber) as any[];

  // Calculate proportional invoice discount ratio
  const subtotal = Number(invoice.total_selling_price || 0);
  const invDiscount = Math.max(0, Number(invoice.discount || 0));
  const discountRatio = (subtotal > 0 && invDiscount > 0) ? Math.max(0, (subtotal - invDiscount) / subtotal) : 1;

  const enrichedItems: SalesInvoiceItem[] = rawItems.map(item => {
    const returnedQty = Number(item.returned_quantity || 0);
    const remainingQty = Math.max(0, Math.round((Number(item.quantity) - returnedQty) * 10000) / 10000);
    const lineTotal = Number(item.line_total || (item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100)));
    const netLineTotal = Math.round(lineTotal * discountRatio * 100) / 100;
    const effectiveUnitPrice = item.quantity > 0 ? Math.round((netLineTotal / item.quantity) * 100) / 100 : item.unit_price;

    return {
      ...item,
      returned_quantity: returnedQty,
      remaining_quantity: remainingQty,
      effective_unit_price: effectiveUnitPrice
    };
  });

  const isFullyReturned = enrichedItems.length > 0 && enrichedItems.every(i => (i.remaining_quantity || 0) <= 0);

  return { invoice, items: enrichedItems, is_fully_returned: isFullyReturned };
}

/**
 * Phase 3: Inventory Filter & Pagination
 */
export function getInventoryFilter(
  filterType: InventoryFilterType = 'all',
  page: number = 1,
  limit: number = 50,
  searchQuery: string = ''
): InventoryFilterResult {
  const database = getDatabaseInstance();
  const offset = (Math.max(1, page) - 1) * limit;
  const trimmed = searchQuery.trim();

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  switch (filterType) {
    case 'in_stock':
      whereClauses.push('current_stock > 0');
      break;
    case 'zero_stock':
      whereClauses.push('current_stock <= 0');
      break;
    case 'near_expiry': {
      const targetYear = String(new Date().getFullYear() + 1);
      whereClauses.push(`(expiry_date IS NOT NULL AND expiry_date != '' AND (SUBSTR(expiry_date, -4) <= '${targetYear}' OR SUBSTR(expiry_date, 1, 4) <= '${targetYear}'))`);
      break;
    }
    case 'scheduled':
      whereClauses.push('tax_schedule_category IN (1, 2)');
      break;
    case 'recent_price_changes':
      whereClauses.push('(previous_price IS NOT NULL AND previous_price > 0 AND previous_price != consumer_price)');
      break;
    case 'all':
    default:
      break;
  }

  if (trimmed) {
    whereClauses.push('(item_name_en LIKE ? OR item_name_ar LIKE ? OR generic_name LIKE ? OR barcode LIKE ?)');
    const p = `%${trimmed}%`;
    params.push(p, p, p, p);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countSql = `SELECT count(*) as count FROM items ${whereSql}`;
  const totalCount = (database.prepare(countSql).get(...params) as { count: number }).count;

  const querySql = `
    SELECT * FROM items 
    ${whereSql}
    ORDER BY (CASE WHEN current_stock > 0 THEN 0 ELSE 1 END), item_name_en ASC
    LIMIT ? OFFSET ?
  `;
  const items = database.prepare(querySql).all(...params, limit, offset) as Item[];

  return {
    items,
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit) || 1
  };
}

/**
 * Phase 3: Item Full Movement History Card
 */
export function getItemFullHistory(itemId: number): ItemFullHistory | null {
  const database = getDatabaseInstance();
  const item = database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId) as Item | undefined;
  if (!item) return null;

  // Sales history (last 30)
  const salesHistory = database.prepare(`
    SELECT 
      s.invoice_number, 
      s.invoice_date, 
      s.invoice_time, 
      si.quantity, 
      si.unit_price, 
      si.line_total, 
      si.unit_type
    FROM sales_invoice_items si
    JOIN sales_invoices s ON si.invoice_number = s.invoice_number
    WHERE si.item_id = ?
    ORDER BY s.invoice_number DESC
    LIMIT 30
  `).all(itemId) as ItemFullHistory['salesHistory'];

  // Purchases history (last 30)
  const purchasesHistory = database.prepare(`
    SELECT 
      p.purchase_invoice_id, 
      p.invoice_date, 
      p.supplier_name, 
      pi.quantity, 
      COALESCE(pi.bonus_quantity, 0) as bonus_quantity,
      pi.consumer_price, 
      pi.buy_price, 
      pi.line_total
    FROM purchase_invoice_items pi
    JOIN purchases_invoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
    WHERE pi.item_id = ?
    ORDER BY p.purchase_invoice_id DESC
    LIMIT 30
  `).all(itemId) as ItemFullHistory['purchasesHistory'];

  // Price changes history
  const priceChangesHistory = database.prepare(`
    SELECT 
      id, 
      COALESCE(old_price, 0) as old_price, 
      new_price, 
      change_timestamp
    FROM price_change_history
    WHERE item_name = ? OR (item_id IS NOT NULL AND item_id = ?)
    ORDER BY id DESC
    LIMIT 30
  `).all(item.item_name_en, itemId) as ItemFullHistory['priceChangesHistory'];

  return {
    item,
    salesHistory,
    purchasesHistory,
    priceChangesHistory
  };
}

/**
 * Phase 3: Save or Update Item in Catalog
 */
export function saveOrUpdateItem(itemData: SaveItemPayload): Item {
  const database = getDatabaseInstance();

  const tx = database.transaction(() => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];
    const timestamp = `${dateStr} ${timeStr}`;

    if (itemData.item_id) {
      // 1. UPDATE EXISTING ITEM
      const existing = database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemData.item_id) as Item | undefined;
      if (!existing) {
        throw new Error(`الصنف رقم #${itemData.item_id} غير موجود.`);
      }

      let previousPrice = existing.previous_price;
      // Price change tracking
      if (itemData.consumer_price !== undefined && Math.abs(itemData.consumer_price - existing.consumer_price) > 0.01) {
        previousPrice = existing.consumer_price;
        const maxPriceId = (database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM price_change_history').get() as { m: number }).m + 1;
        database.prepare(`
          INSERT INTO price_change_history (id, item_name, new_price, change_timestamp, item_id, old_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          maxPriceId,
          itemData.item_name_en || existing.item_name_en,
          itemData.consumer_price,
          timestamp,
          itemData.item_id,
          existing.consumer_price
        );
      }

      const nextEnName = itemData.item_name_en ?? existing.item_name_en;
      const nextArName = itemData.item_name_ar ?? existing.item_name_ar;
      const nextPhonetic = [computePhoneticKey(nextEnName || ''), computePhoneticKey(nextArName || '')].filter(Boolean).join(' ').trim();

      database.prepare(`
        UPDATE items SET
          barcode = COALESCE(?, barcode),
          item_name_en = COALESCE(?, item_name_en),
          item_name_ar = COALESCE(?, item_name_ar),
          producer = COALESCE(?, producer),
          generic_name = COALESCE(?, generic_name),
          category = COALESCE(?, category),
          consumer_price = COALESCE(?, consumer_price),
          previous_price = COALESCE(?, previous_price),
          package_units = COALESCE(?, package_units),
          discount_pct = COALESCE(?, discount_pct),
          buy_price = COALESCE(?, buy_price),
          current_stock = COALESCE(?, current_stock),
          expiry_date = COALESCE(?, expiry_date),
          pharmacy_discount_percent = COALESCE(?, pharmacy_discount_percent),
          tax_schedule_category = COALESCE(?, tax_schedule_category),
          temp_price = COALESCE(?, temp_price),
          temp_price_active = COALESCE(?, temp_price_active),
          short_code = COALESCE(?, short_code),
          phonetic_key = ?
        WHERE item_id = ?
      `).run(
        itemData.barcode,
        itemData.item_name_en,
        itemData.item_name_ar,
        itemData.producer,
        itemData.generic_name,
        itemData.category,
        itemData.consumer_price,
        previousPrice,
        itemData.package_units,
        itemData.discount_pct,
        itemData.buy_price,
        itemData.current_stock,
        itemData.expiry_date,
        itemData.pharmacy_discount_percent,
        itemData.tax_schedule_category,
        itemData.temp_price ?? existing.temp_price ?? 0,
        itemData.temp_price_active ?? existing.temp_price_active ?? 0,
        itemData.short_code ?? existing.short_code ?? '',
        nextPhonetic || String(itemData.item_id),
        itemData.item_id
      );

      // Update FTS5
      try {
        database.prepare('DELETE FROM items_fts WHERE item_id = ?').run(itemData.item_id);
        database.prepare(`
          INSERT INTO items_fts (rowid, item_id, barcode, item_name_en, item_name_ar, generic_name)
          SELECT item_id, item_id, COALESCE(barcode, ''), COALESCE(item_name_en, ''), COALESCE(item_name_ar, ''), COALESCE(generic_name, '')
          FROM items WHERE item_id = ?
        `).run(itemData.item_id);
      } catch {
        // FTS update fail safe
      }

      return database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemData.item_id) as Item;
    } else {
      // 2. INSERT NEW ITEM
      const maxRow = database.prepare('SELECT COALESCE(MAX(item_id), 0) as m FROM items').get() as { m: number };
      const newItemId = maxRow.m + 1;
      const barcode = itemData.barcode && itemData.barcode.trim() !== ''
        ? itemData.barcode.trim()
        : `LOC${String(newItemId).padStart(7, '0')}`;

      const newPhonetic = [
        computePhoneticKey(itemData.item_name_en.trim()),
        computePhoneticKey(itemData.item_name_ar?.trim() || '')
      ].filter(Boolean).join(' ').trim();

      database.prepare(`
        INSERT INTO items (
          item_id, barcode, item_name_en, item_name_ar, producer, generic_name, category,
          consumer_price, previous_price, package_units, discount_pct, buy_price,
          current_stock, expiry_date, pharmacy_discount_percent, tax_schedule_category,
          temp_price, temp_price_active, short_code, phonetic_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newItemId,
        barcode,
        itemData.item_name_en.trim(),
        itemData.item_name_ar?.trim() || '',
        itemData.producer?.trim() || '',
        itemData.generic_name?.trim() || '',
        itemData.category?.trim() || 'عام',
        itemData.consumer_price || 0,
        null,
        itemData.package_units || 1,
        itemData.discount_pct || 0,
        itemData.buy_price || (itemData.consumer_price ? itemData.consumer_price * 0.75 : 0),
        itemData.current_stock || 0,
        itemData.expiry_date || '',
        itemData.pharmacy_discount_percent || 0,
        itemData.tax_schedule_category || 0,
        itemData.temp_price || 0,
        itemData.temp_price_active || 0,
        itemData.short_code?.trim() || '',
        newPhonetic || String(newItemId)
      );

      // Insert into FTS5
      try {
        database.prepare(`
          INSERT INTO items_fts (rowid, item_id, barcode, item_name_en, item_name_ar, generic_name)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          newItemId,
          newItemId,
          barcode,
          itemData.item_name_en.trim(),
          itemData.item_name_ar?.trim() || '',
          itemData.generic_name?.trim() || ''
        );
      } catch {
        // FTS safe
      }

      return database.prepare('SELECT * FROM items WHERE item_id = ?').get(newItemId) as Item;
    }
  });

  return tx();
}

/**
 * Phase 3: Stock Adjustment for Inventory Auditing
 */
export function adjustItemStock(itemId: number, newStock: number, newExpiry?: string, _reason?: string): Item {
  const database = getDatabaseInstance();

  const tx = database.transaction(() => {
    const existing = database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId) as Item | undefined;
    if (!existing) {
      throw new Error(`الصنف رقم #${itemId} غير موجود.`);
    }

    const validStock = Math.round(newStock * 10000) / 10000;
    const expiry = newExpiry !== undefined ? newExpiry : existing.expiry_date;
    const diff = Math.round((validStock - existing.current_stock) * 10000) / 10000;
    const local = getLocalDateTime();

    database.prepare(`
      UPDATE items 
      SET current_stock = ?, expiry_date = ?
      WHERE item_id = ?
    `).run(validStock, expiry, itemId);

    // Audit Log in inventory_adjustments_log
    try {
      database.prepare(`
        INSERT INTO inventory_adjustments_log (
          item_id, item_name, old_stock, new_stock, difference, old_expiry, new_expiry, reason, user_name, adjusted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        itemId,
        existing.item_name_en || existing.item_name_ar || `صنف #${itemId}`,
        existing.current_stock,
        validStock,
        diff,
        existing.expiry_date || '',
        expiry || '',
        _reason || 'تعديل يدوي للمخزون',
        'مدير الصيدلية',
        local.timestamp
      );
    } catch (e) {
      console.error('Error logging inventory adjustment:', e);
    }

    // Auto shortage check
    if (validStock <= 0) {
      const checkShortage = database.prepare('SELECT count(*) as c FROM shortages_drafts WHERE item_id = ?').get(itemId) as { c: number };
      if (checkShortage.c === 0) {
        const maxId = (database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM shortages_drafts').get() as { m: number }).m + 1;
        database.prepare(`
          INSERT INTO shortages_drafts (id, supplier_id, supplier_name, item_id, item_name, quantity, order_code)
          VALUES (?, 1, 'الشراء من غير الموردين', ?, ?, 1, '')
        `).run(maxId, itemId, existing.item_name_en);
      }
    }

    return database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId) as Item;
  });

  return tx();
}

/**
 * Phase 3: Create Purchase Receiving Invoice (Atomic Transaction)
 */
export function createPurchaseInvoice(payload: CreatePurchaseInvoicePayload): CreatePurchaseInvoiceResult {
  const database = getDatabaseInstance();

  if (!payload.items || payload.items.length === 0) {
    throw new Error('لا يمكن حفظ فاتورة مشتريات بدون أصناف.');
  }

  for (const item of payload.items) {
    if (!item.item_id || item.item_id <= 0) {
      throw new Error('معرف الصنف في فاتورة الشراء غير صالح.');
    }
    if (!item.quantity || item.quantity <= 0 || isNaN(item.quantity)) {
      throw new Error('كمية الشراء يجب أن تكون أكبر من الصفر.');
    }
  }

  const tx = database.transaction(() => {
    const maxInvRow = database.prepare('SELECT COALESCE(MAX(purchase_invoice_id), 0) as m FROM purchases_invoices').get() as { m: number };
    const purchaseInvoiceId = maxInvRow.m + 1;

    const local = getLocalDateTime();
    const invoiceDate = payload.invoice_date || local.date;
    const fullTimestamp = `${invoiceDate} ${local.time}`;

    let totalAmount = 0;
    for (const item of payload.items) {
      const disc = Math.min(100, Math.max(0, Number(item.discount_pct || 0)));
      item.discount_pct = disc;
      const lineTotal = Math.round(item.quantity * item.buy_price * (1 - (disc / 100)) * 100) / 100;
      item.line_total = lineTotal;
      totalAmount += lineTotal;
    }
    totalAmount = Math.round(totalAmount * 100) / 100;

    // 1. Insert Header
    database.prepare(`
      INSERT INTO purchases_invoices (
        purchase_invoice_id, supplier_id, supplier_name, invoice_date,
        item_count, total_amount, paper_invoice_number, payment_method, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      purchaseInvoiceId,
      payload.supplier_id,
      payload.supplier_name,
      invoiceDate,
      payload.items.length,
      totalAmount,
      payload.paper_invoice_number || '',
      payload.payment_method,
      payload.notes || ''
    );

    // 2. Insert items and update stock, prices, and clean shortages
    const maxItemRow = database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM purchase_invoice_items').get() as { m: number };
    let currentItemId = maxItemRow.m;

    const maxPriceIdRow = database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM price_change_history').get() as { m: number };
    let currentPriceId = maxPriceIdRow.m;

    const insertItemStmt = database.prepare(`
      INSERT INTO purchase_invoice_items (
        id, purchase_invoice_id, line_number, item_id, item_name,
        quantity, consumer_price, buy_price, line_total, bonus_quantity, discount_pct, expiry_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateItemStmt = database.prepare(`
      UPDATE items 
      SET 
        current_stock = ROUND(current_stock + ?, 4),
        buy_price = ?,
        expiry_date = CASE WHEN ? != '' THEN ? ELSE expiry_date END,
        last_bought_at = ?
      WHERE item_id = ?
    `);

    const deleteShortageStmt = database.prepare('DELETE FROM shortages_drafts WHERE item_id = ?');

    let lineNumber = 1;
    for (const item of payload.items) {
      currentItemId++;
      const bonus = Math.max(0, Number(item.bonus_quantity || 0));
      const totalReceived = item.quantity + bonus;
      const effectiveBuyPrice = totalReceived > 0 
        ? Math.round((item.line_total / totalReceived) * 100) / 100 
        : item.buy_price;

      insertItemStmt.run(
        currentItemId,
        purchaseInvoiceId,
        lineNumber++,
        item.item_id,
        item.item_name,
        item.quantity,
        item.consumer_price,
        effectiveBuyPrice,
        item.line_total,
        bonus,
        item.discount_pct || 0,
        item.expiry_date || ''
      );

      // Stock & Effective Buy Price Update
      updateItemStmt.run(
        totalReceived,
        effectiveBuyPrice,
        item.expiry_date || '',
        item.expiry_date || '',
        invoiceDate,
        item.item_id
      );

      // Check if consumer price changed
      const currentItemRow = database.prepare('SELECT consumer_price, item_name_en FROM items WHERE item_id = ?').get(item.item_id) as { consumer_price: number; item_name_en: string } | undefined;
      if (currentItemRow && item.consumer_price > 0 && Math.abs(currentItemRow.consumer_price - item.consumer_price) > 0.01) {
        currentPriceId++;
        database.prepare(`
          INSERT INTO price_change_history (id, item_name, new_price, change_timestamp, item_id, old_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          currentPriceId,
          currentItemRow.item_name_en,
          item.consumer_price,
          fullTimestamp,
          item.item_id,
          currentItemRow.consumer_price
        );

        database.prepare(`
          UPDATE items 
          SET previous_price = consumer_price, consumer_price = ?
          WHERE item_id = ?
        `).run(item.consumer_price, item.item_id);
      }

      // Auto-clean from shortages notebook
      deleteShortageStmt.run(item.item_id);
    }

    // 3. Financial accounting & treasury
    if (payload.payment_method === 'نقدي') {
      database.prepare(`
        UPDATE treasury_state
        SET cash_balance = ROUND(cash_balance - ?, 2), last_updated = ?
        WHERE id = 1
      `).run(totalAmount, fullTimestamp);

      // General ledger (Double-Entry: Debit Inventory, Credit Cash)
      try {
        const maxLedgerId = (database.prepare('SELECT COALESCE(MAX(entry_id), 0) as m FROM general_ledger_2026').get() as { m: number }).m;
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'اصول.متداولة.مخزون', ?, ?, ?, ?, 0)
        `).run(
          maxLedgerId + 1,
          invoiceDate,
          `PUR-${purchaseInvoiceId}`,
          `مشتريات نقدية فاتورة #${purchaseInvoiceId} - ${payload.supplier_name}`,
          totalAmount,
          totalAmount
        );

        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'اصول.متداولة.نقدية.كاش', ?, ?, ?, 0, ?)
        `).run(
          maxLedgerId + 2,
          invoiceDate,
          `PUR-${purchaseInvoiceId}`,
          `سداد نقدي مشتريات فاتورة #${purchaseInvoiceId} - ${payload.supplier_name}`,
          -totalAmount,
          totalAmount
        );
      } catch (glErr: unknown) {
        const msg = glErr instanceof Error ? glErr.message : String(glErr);
        if (!msg.includes('UNIQUE constraint failed')) {
          console.error('Error posting cash purchase to general_ledger_2026:', glErr);
        }
      }
    } else {
      // Credit (آجل) - (Double-Entry: Debit Inventory, Credit Supplier Liabilities)
      try {
        const maxLedgerId = (database.prepare('SELECT COALESCE(MAX(entry_id), 0) as m FROM general_ledger_2026').get() as { m: number }).m;
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'اصول.متداولة.مخزون', ?, ?, ?, ?, 0)
        `).run(
          maxLedgerId + 1,
          invoiceDate,
          `PUR-${purchaseInvoiceId}`,
          `مشتريات آجل فاتورة #${purchaseInvoiceId} - ${payload.supplier_name}`,
          totalAmount,
          totalAmount
        );

        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'خصوم.متداولة.موردين', ?, ?, ?, 0, ?)
        `).run(
          maxLedgerId + 2,
          invoiceDate,
          `PUR-${purchaseInvoiceId}`,
          `استحقاق مورد فاتورة مشتريات #${purchaseInvoiceId} - ${payload.supplier_name}`,
          -totalAmount,
          totalAmount
        );
      } catch (glErr: unknown) {
        const msg = glErr instanceof Error ? glErr.message : String(glErr);
        if (!msg.includes('UNIQUE constraint failed')) {
          console.error('Error posting credit purchase to general_ledger_2026:', glErr);
        }
      }
    }

    // 4. Supplier transaction log
    const maxTxId = (database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM supplier_transactions').get() as { m: number }).m + 1;
    database.prepare(`
      INSERT INTO supplier_transactions (id, supplier_id, supplier_name, transaction_type, amount, transaction_date, invoice_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      maxTxId,
      payload.supplier_id,
      payload.supplier_name,
      payload.payment_method === 'نقدي' ? 'سداد نقدي' : 'فاتورة مشتريات',
      totalAmount,
      fullTimestamp,
      purchaseInvoiceId,
      payload.notes || ''
    );

    return {
      success: true,
      purchase_invoice_id: purchaseInvoiceId,
      supplier_name: payload.supplier_name,
      item_count: payload.items.length,
      total_amount: totalAmount,
      invoice_date: invoiceDate
    };
  });

  return tx();
}

/**
 * Phase 3: Suppliers list & stats
 */
export function getSuppliers(): Supplier[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT 
      s.supplier_id,
      s.supplier_name,
      s.contact_phone,
      COALESCE(s.tax_id, '') as tax_id,
      COALESCE(s.address, '') as address,
      COALESCE(s.credit_limit, 0) as credit_limit,
      COALESCE(s.opening_balance, 0) as opening_balance,
      COALESCE((
        SELECT SUM(p.total_amount)
        FROM purchases_invoices p
        WHERE p.supplier_id = s.supplier_id
      ), 0) as total_purchases,
      COALESCE((
        SELECT SUM(ABS(st.amount))
        FROM supplier_transactions st
        WHERE st.supplier_id = s.supplier_id
          AND st.transaction_type IN ('سداد دفعة مورد', 'سداد دفعة نقدية')
      ), 0) as total_paid,
      COALESCE((
        SELECT SUM(pr.credit_amount)
        FROM purchase_returns pr
        WHERE pr.supplier_id = s.supplier_id
          AND pr.settlement_mode = 'SUPPLIER_CREDIT'
      ), 0) as total_returns,
      ROUND(
        COALESCE(s.opening_balance, 0)
        + COALESCE((
            SELECT SUM(p.total_amount)
            FROM purchases_invoices p
            WHERE p.supplier_id = s.supplier_id
              AND COALESCE(p.payment_method, 'آجل') NOT IN ('نقدي', 'CASH')
          ), 0)
        - COALESCE((
            SELECT SUM(ABS(st.amount))
            FROM supplier_transactions st
            WHERE st.supplier_id = s.supplier_id
              AND st.transaction_type IN ('سداد دفعة مورد', 'سداد دفعة نقدية')
          ), 0)
        - COALESCE((
            SELECT SUM(pr.credit_amount)
            FROM purchase_returns pr
            WHERE pr.supplier_id = s.supplier_id
              AND pr.settlement_mode = 'SUPPLIER_CREDIT'
          ), 0),
        2
      ) as current_balance,
      (SELECT MAX(p.invoice_date) FROM purchases_invoices p WHERE p.supplier_id = s.supplier_id) as last_invoice_date,
      (SELECT COUNT(p.purchase_invoice_id) FROM purchases_invoices p WHERE p.supplier_id = s.supplier_id) as invoices_count,
      COALESCE(s.excel_column_map_json, '') as excel_column_map_json
    FROM suppliers s
    ORDER BY s.supplier_id ASC
  `).all() as Supplier[];
}

export function saveSupplier(supplierData: {
  supplier_id?: number;
  supplier_name: string;
  contact_phone?: string;
  tax_id?: string;
  address?: string;
  credit_limit?: number;
  opening_balance?: number;
}): Supplier {
  const database = getDatabaseInstance();
  const trimmedName = supplierData.supplier_name.trim();
  if (!trimmedName) throw new Error('اسم المورد مطلوب');

  const tx = database.transaction(() => {
    if (supplierData.supplier_id) {
      database.prepare(`
        UPDATE suppliers 
        SET supplier_name = ?,
            contact_phone = COALESCE(?, contact_phone),
            tax_id = COALESCE(?, tax_id),
            address = COALESCE(?, address),
            credit_limit = COALESCE(?, credit_limit),
            opening_balance = COALESCE(?, opening_balance)
        WHERE supplier_id = ?
      `).run(
        trimmedName,
        supplierData.contact_phone ?? null,
        supplierData.tax_id ?? null,
        supplierData.address ?? null,
        supplierData.credit_limit ?? null,
        supplierData.opening_balance ?? null,
        supplierData.supplier_id
      );
      return getSuppliers().find((s) => s.supplier_id === supplierData.supplier_id) as Supplier;
    } else {
      const maxId = (database.prepare('SELECT COALESCE(MAX(supplier_id), 0) as m FROM suppliers').get() as { m: number }).m + 1;
      database.prepare(`
        INSERT INTO suppliers (supplier_id, supplier_name, contact_phone, tax_id, address, credit_limit, opening_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        maxId,
        trimmedName,
        supplierData.contact_phone || '',
        supplierData.tax_id || '',
        supplierData.address || '',
        Number(supplierData.credit_limit || 0),
        Number(supplierData.opening_balance || 0)
      );
      return getSuppliers().find((s) => s.supplier_id === maxId) as Supplier;
    }
  });

  return tx();
}

/**
 * Phase 3: Purchase Invoices List & Items
 */
export function getPurchaseInvoices(limit: number = 50): PurchaseInvoice[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT * FROM purchases_invoices
    ORDER BY purchase_invoice_id DESC
    LIMIT ?
  `).all(limit) as PurchaseInvoice[];
}

export function getPurchaseInvoiceItems(invoiceId: number): PurchaseInvoiceItem[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT * FROM purchase_invoice_items
    WHERE purchase_invoice_id = ?
    ORDER BY line_number ASC
  `).all(invoiceId) as PurchaseInvoiceItem[];
}

/**
 * Phase 3: Shortages Notebook Engine
 */
export function getShortages(supplierFilter: number = 0, searchQuery: string = ''): ShortageItem[] {
  const database = getDatabaseInstance();
  const trimmed = searchQuery.trim();
  const p = `%${trimmed}%`;

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (supplierFilter > 0) {
    whereClauses.push('s.supplier_id = ?');
    params.push(supplierFilter);
  }

  if (trimmed) {
    whereClauses.push('(s.item_name LIKE ? OR i.item_name_ar LIKE ? OR i.generic_name LIKE ? OR i.barcode LIKE ?)');
    params.push(p, p, p, p);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  return database.prepare(`
    SELECT 
      s.id as shortage_id,
      s.item_id,
      s.item_name,
      s.quantity,
      s.supplier_id,
      s.supplier_name,
      s.order_code,
      i.item_name_ar,
      i.generic_name,
      i.producer,
      COALESCE(i.consumer_price, 0) as consumer_price,
      COALESCE(i.buy_price, 0) as buy_price,
      COALESCE(i.discount_pct, 0) as discount_pct,
      COALESCE(i.package_units, 1) as package_units,
      COALESCE(i.current_stock, 0) as current_stock,
      i.barcode
    FROM shortages_drafts s
    LEFT JOIN items i ON s.item_id = i.item_id
    ${whereSql}
    ORDER BY s.id DESC
  `).all(...params) as ShortageItem[];
}

export function addOrUpdateShortage(itemId: number, quantity: number, supplierId?: number): ShortageItem {
  const database = getDatabaseInstance();

  const tx = database.transaction(() => {
    const item = database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId) as Item | undefined;
    if (!item) throw new Error(`الصنف رقم #${itemId} غير موجود.`);

    const supId = supplierId || 1;
    const supRow = database.prepare('SELECT supplier_name FROM suppliers WHERE supplier_id = ?').get(supId) as { supplier_name: string } | undefined;
    const supName = supRow?.supplier_name || 'الشراء من غير الموردين';

    const existing = database.prepare('SELECT * FROM shortages_drafts WHERE item_id = ?').get(itemId) as any;

    if (existing) {
      database.prepare(`
        UPDATE shortages_drafts 
        SET quantity = ?, supplier_id = ?, supplier_name = ?
        WHERE id = ?
      `).run(quantity, supId, supName, existing.id);

      return {
        shortage_id: existing.id,
        item_id: itemId,
        item_name: item.item_name_en,
        quantity,
        supplier_id: supId,
        supplier_name: supName,
        consumer_price: item.consumer_price,
        package_units: item.package_units,
        current_stock: item.current_stock
      } as ShortageItem;
    } else {
      const maxId = (database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM shortages_drafts').get() as { m: number }).m + 1;
      database.prepare(`
        INSERT INTO shortages_drafts (id, supplier_id, supplier_name, item_id, item_name, quantity, order_code)
        VALUES (?, ?, ?, ?, ?, ?, '')
      `).run(maxId, supId, supName, itemId, item.item_name_en, quantity);

      return {
        shortage_id: maxId,
        item_id: itemId,
        item_name: item.item_name_en,
        quantity,
        supplier_id: supId,
        supplier_name: supName,
        consumer_price: item.consumer_price,
        package_units: item.package_units,
        current_stock: item.current_stock
      } as ShortageItem;
    }
  });

  return tx();
}

export function removeShortage(shortageId: number): { success: boolean; shortageId: number } {
  const database = getDatabaseInstance();
  database.prepare('DELETE FROM shortages_drafts WHERE id = ?').run(shortageId);
  return { success: true, shortageId };
}

export function clearCompletedShortages(): { clearedCount: number } {
  const database = getDatabaseInstance();
  const result = database.prepare(`
    DELETE FROM shortages_drafts 
    WHERE item_id IN (SELECT item_id FROM items WHERE current_stock > 0)
  `).run();
  return { clearedCount: result.changes };
}

// =========================================================================
// PHASE 4: TREASURY, SHIFTS, CUSTOMERS & DELIVERY, FINANCIAL & AUDIT REPORTS
// =========================================================================

/**
 * 1. Treasury Overview: Live Cash Balance, Daily Inflows/Outflows, Recent Ledger Entries
 */
export function getTreasuryOverview(): TreasuryOverview {
  const database = getDatabaseInstance();

  // 1. Current cash balance
  const treasuryRow = database.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number } | undefined;
  const cashBalance = treasuryRow ? treasuryRow.cash_balance : 119242.5;

  // 2. Today's date (Local Date)
  const today = getLocalDateTime().date;

  // Today cash inflows: cash sales today (net of discount) + deposits today + customer payments today - cash returns today
  const salesInflow = (database.prepare(`
    SELECT COALESCE(SUM(total_selling_price - discount), 0) as total 
    FROM sales_invoices 
    WHERE invoice_date = ? AND payment_method IN ('نقدي', 'دليفري')
  `).get(today) as { total: number }).total;

  const returnsToday = (database.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) as total
    FROM sales_returns
    WHERE return_date = ? AND payment_method IN ('نقدي', 'دليفري')
  `).get(today) as { total: number }).total;

  const netSalesInflow = Math.max(0, Math.round((salesInflow - returnsToday) * 100) / 100);

  const depositsInflow = (database.prepare(`
    SELECT COALESCE(SUM(credit), 0) as total 
    FROM general_ledger_2026 
    WHERE entry_date = ? AND account_name LIKE '%رأس_المال%'
  `).get(today) as { total: number }).total;

  const customerPaymentsInflow = (database.prepare(`
    SELECT COALESCE(SUM(debit), 0) as total 
    FROM general_ledger_2026 
    WHERE entry_date = ? AND account_name LIKE '%نقدية%' AND notes LIKE '%تحصيل%'
  `).get(today) as { total: number }).total;

  const todayInflow = Math.round((netSalesInflow + depositsInflow + customerPaymentsInflow) * 100) / 100;

  // Today cash outflows: cash purchases today + expenses today + withdrawals today + supplier payments today
  const purchasesOutflow = (database.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total 
    FROM purchases_invoices 
    WHERE invoice_date = ? AND payment_method IN ('نقدي', 'CASH')
  `).get(today) as { total: number }).total;

  const expensesOutflow = (database.prepare(`
    SELECT COALESCE(SUM(debit), 0) as total 
    FROM general_ledger_2026 
    WHERE entry_date = ? AND account_name LIKE 'مصروفات%'
  `).get(today) as { total: number }).total;

  const withdrawalsOutflow = (database.prepare(`
    SELECT COALESCE(SUM(debit), 0) as total 
    FROM general_ledger_2026 
    WHERE entry_date = ? AND account_name LIKE '%مسحوبات%'
  `).get(today) as { total: number }).total;

  const supplierPaymentsOutflow = (database.prepare(`
    SELECT COALESCE(SUM(debit), 0) as total 
    FROM general_ledger_2026 
    WHERE entry_date = ? AND (account_name LIKE '%خصوم.متداولة.موردين%' OR account_name LIKE '%خصوم.موردين%') AND (document_ref LIKE 'PAY-SUP%' OR document_ref LIKE 'SUP-PAY-%')
  `).get(today) as { total: number }).total;

  const todayOutflow = Math.round((purchasesOutflow + expensesOutflow + withdrawalsOutflow + supplierPaymentsOutflow) * 100) / 100;
  const netToday = Math.round((todayInflow - todayOutflow) * 100) / 100;

  // 3. Recent 50 ledger entries
  const recentEntries = database.prepare(`
    SELECT entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit 
    FROM general_ledger_2026 
    ORDER BY entry_id DESC 
    LIMIT 50
  `).all() as LedgerEntry[];

  return {
    cash_balance: cashBalance,
    today_inflow: todayInflow,
    today_outflow: todayOutflow,
    net_today: netToday,
    recent_entries: recentEntries
  };
}

/**
 * 2. Record Treasury Transaction: Expense, Deposit, Withdrawal, Supplier Payment
 */
export function recordTreasuryTransaction(payload: RecordTreasuryTransactionPayload): {
  success: boolean;
  new_balance: number;
  entry_id: number;
} {
  const database = getDatabaseInstance();

  if (!payload.amount || payload.amount <= 0 || isNaN(payload.amount)) {
    throw new Error('مبلغ المعاملة بالخزينة يجب أن يكون أكبر من الصفر.');
  }

  const tx = database.transaction(() => {
    const local = getLocalDateTime();
    const entryDate = local.date;
    const timestamp = local.timestamp;

    const treasuryRow = database.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number } | undefined;
    const currentBalance = treasuryRow ? treasuryRow.cash_balance : 119242.5;
    let newBalance = currentBalance;

    const maxEntryId = (database.prepare('SELECT COALESCE(MAX(entry_id), 0) as m FROM general_ledger_2026').get() as { m: number }).m;
    const firstEntryId = maxEntryId + 1;
    const seq = (database.prepare('SELECT COUNT(*) as c FROM general_ledger_2026 WHERE entry_date = ?').get(entryDate) as { c: number }).c + 1;
    const dayTag = entryDate.replace(/-/g, '');

    if (payload.type === 'EXPENSE') {
      newBalance = Math.round((currentBalance - payload.amount) * 100) / 100;
      const docRef = `EXP-${dayTag}-${seq}`;

      try {
        // 1. Debit expense account
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(firstEntryId, entryDate, `مصروفات.تشغيلية.${payload.category || 'عام'}`, docRef, payload.notes || 'مصروفات تشغيلية', payload.amount, payload.amount);

        // 2. Credit cash account
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'اصول.متداولة.نقدية.كاش', ?, ?, ?, 0, ?)
        `).run(firstEntryId + 1, entryDate, docRef, payload.notes || 'صرف نقدي من الخزينة', -payload.amount, payload.amount);
      } catch (glErr: unknown) {
        const msg = glErr instanceof Error ? glErr.message : String(glErr);
        if (!msg.includes('UNIQUE constraint failed')) {
          console.error('Error posting expense to general_ledger_2026:', glErr);
        }
      }

    } else if (payload.type === 'DEPOSIT') {
      newBalance = Math.round((currentBalance + payload.amount) * 100) / 100;
      const docRef = `DEP-${dayTag}-${seq}`;

      try {
        // 1. Debit cash account
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'اصول.متداولة.نقدية.كاش', ?, ?, ?, ?, 0)
        `).run(firstEntryId, entryDate, docRef, payload.notes || 'إيداع نقدي بالخزينة', payload.amount, payload.amount);

        // 2. Credit capital / owner equity
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'حقوق.ملكية.رأس_المال', ?, ?, ?, 0, ?)
        `).run(firstEntryId + 1, entryDate, docRef, payload.notes || 'إيداع رأس مال بالخزينة', -payload.amount, payload.amount);
      } catch (glErr: unknown) {
        const msg = glErr instanceof Error ? glErr.message : String(glErr);
        if (!msg.includes('UNIQUE constraint failed')) {
          console.error('Error posting deposit to general_ledger_2026:', glErr);
        }
      }

    } else if (payload.type === 'WITHDRAWAL') {
      newBalance = Math.round((currentBalance - payload.amount) * 100) / 100;
      const docRef = `WTH-${dayTag}-${seq}`;

      try {
        // 1. Debit owner withdrawals
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'حقوق.ملكية.مسحوبات_شخصية', ?, ?, ?, ?, 0)
        `).run(firstEntryId, entryDate, docRef, payload.notes || 'مسحوبات نقدية للمالك', payload.amount, payload.amount);

        // 2. Credit cash account
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'اصول.متداولة.نقدية.كاش', ?, ?, ?, 0, ?)
        `).run(firstEntryId + 1, entryDate, docRef, payload.notes || 'سحب نقدي من الخزينة', -payload.amount, payload.amount);
      } catch (glErr: unknown) {
        const msg = glErr instanceof Error ? glErr.message : String(glErr);
        if (!msg.includes('UNIQUE constraint failed')) {
          console.error('Error posting withdrawal to general_ledger_2026:', glErr);
        }
      }

    } else if (payload.type === 'SUPPLIER_PAYMENT') {
      newBalance = Math.round((currentBalance - payload.amount) * 100) / 100;
      const docRef = `PAY-SUP-${payload.supplier_id || 0}-${dayTag}-${seq}`;

      const supName = payload.supplier_id 
        ? (database.prepare('SELECT supplier_name FROM suppliers WHERE supplier_id = ?').get(payload.supplier_id) as any)?.supplier_name || 'مورد'
        : 'مورد';

      try {
        // 1. Debit supplier liability
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'خصوم.متداولة.موردين', ?, ?, ?, ?, 0)
        `).run(firstEntryId, entryDate, docRef, `سداد دفعة للمورد: ${supName} - ${payload.notes || ''}`, payload.amount, payload.amount);

        // 2. Credit cash account
        database.prepare(`
          INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
          VALUES (?, ?, 'اصول.متداولة.نقدية.كاش', ?, ?, ?, 0, ?)
        `).run(firstEntryId + 1, entryDate, docRef, `سداد نقدي للمورد: ${supName}`, -payload.amount, payload.amount);
      } catch (glErr: unknown) {
        const msg = glErr instanceof Error ? glErr.message : String(glErr);
        if (!msg.includes('UNIQUE constraint failed')) {
          console.error('Error posting supplier payment to general_ledger_2026:', glErr);
        }
      }

      // Record supplier transaction
      if (payload.supplier_id) {
        const maxTxId = (database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM supplier_transactions').get() as { m: number }).m + 1;
        database.prepare(`
          INSERT INTO supplier_transactions (id, supplier_id, supplier_name, transaction_type, amount, transaction_date, invoice_id, notes)
          VALUES (?, ?, ?, 'سداد دفعة نقدية', ?, ?, 0, ?)
        `).run(maxTxId, payload.supplier_id, supName, -payload.amount, timestamp, payload.notes || 'سداد نقدي من الخزينة');
      }
    }

    // Update treasury_state
    database.prepare(`
      UPDATE treasury_state 
      SET cash_balance = ?, last_updated = ? 
      WHERE id = 1
    `).run(newBalance, timestamp);

    return {
      success: true,
      new_balance: newBalance,
      entry_id: firstEntryId
    };
  });

  return tx();
}

/**
 * 3. Work Shifts: Get Current Active Shift
 */
export function getCurrentShift(): WorkShift | null {
  const database = getDatabaseInstance();

  const shift = database.prepare(`
    SELECT * FROM work_shifts 
    WHERE status = 'OPEN' 
    ORDER BY shift_id DESC 
    LIMIT 1
  `).get() as any;

  if (!shift) return null;

  // Compute live shift totals from sales_invoices since start_time
  const shiftStartDate = shift.start_time.split(' ')[0] || getLocalDateTime().date;

  const salesStats = database.prepare(`
    SELECT 
      COALESCE(SUM(total_selling_price - discount), 0) as total_sales,
      COALESCE(SUM(CASE WHEN payment_method IN ('نقدي', 'دليفري') THEN (total_selling_price - discount) ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'فيزا' THEN (total_selling_price - discount) ELSE 0 END), 0) as card_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'آجل' THEN (total_selling_price - discount) ELSE 0 END), 0) as credit_sales
    FROM sales_invoices 
    WHERE (invoice_time >= ? OR (invoice_date >= ? AND invoice_time IS NULL))
  `).get(shift.start_time, shiftStartDate) as { total_sales: number; cash_sales: number; card_sales: number; credit_sales: number };

  const expenses = (database.prepare(`
    SELECT COALESCE(SUM(debit), 0) as total 
    FROM general_ledger_2026 
    WHERE entry_date >= ? AND account_name LIKE 'مصروفات%'
  `).get(shiftStartDate) as { total: number }).total;

  const returnsFromSalesReturns = (database.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) as total 
    FROM sales_returns 
    WHERE return_timestamp >= ? AND payment_method IN ('نقدي', 'دليفري')
  `).get(shift.start_time) as { total: number }).total;

  const legacyStartTime = shift.start_time.startsWith('20') ? shift.start_time.slice(2) : shift.start_time;
  const legacyReturns = (database.prepare(`
    SELECT COALESCE(SUM(unit_price * fraction), 0) as total 
    FROM undo_sales_history 
    WHERE sale_timestamp >= ?
  `).get(legacyStartTime) as { total: number }).total;

  const returns = Math.round((returnsFromSalesReturns + legacyReturns) * 100) / 100;
  const openingBalance = shift.opening_balance || 0;
  const expectedCash = Math.round((openingBalance + salesStats.cash_sales - returns - expenses) * 100) / 100;

  return {
    shift_id: shift.shift_id,
    user_id: shift.user_id || 1,
    user_name: shift.user_name || 'الكاشير',
    start_time: shift.start_time,
    end_time: shift.end_time || null,
    status: shift.status as 'OPEN' | 'CLOSED',
    opening_balance: openingBalance,
    actual_cash_counted: shift.actual_cash_counted,
    discrepancy: shift.actual_cash_counted != null ? Math.round((shift.actual_cash_counted - expectedCash) * 100) / 100 : null,
    total_sales: salesStats.total_sales,
    cash_sales: salesStats.cash_sales,
    card_sales: salesStats.card_sales,
    credit_sales: salesStats.credit_sales,
    returns_amount: returns,
    expenses_amount: expenses,
    notes: shift.notes || null
  };
}

/**
 * 4. Work Shifts: Open a New Shift
 */
export function openShift(userId: number, userName: string, openingBalance?: number): WorkShift {
  const database = getDatabaseInstance();

  // Check if open shift exists
  const existing = database.prepare(`SELECT * FROM work_shifts WHERE status = 'OPEN' LIMIT 1`).get() as any;
  if (existing) {
    const cur = getCurrentShift();
    if (cur) return cur;
  }

  // Get current cash balance if openingBalance not specified
  let openBal = openingBalance;
  if (openBal == null) {
    const t = database.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number } | undefined;
    openBal = t ? t.cash_balance : 0;
  }

  const local = getLocalDateTime();
  const timestamp = local.timestamp;

  const res = database.prepare(`
    INSERT INTO work_shifts (
      user_id, user_name, start_time, status, opening_balance, 
      total_sales, cash_sales, card_sales, credit_sales, returns_amount, expenses_amount
    )
    VALUES (?, ?, ?, 'OPEN', ?, 0, 0, 0, 0, 0, 0)
  `).run(userId || 1, userName || 'د. مريم الحميلي', timestamp, openBal);

  const newShiftId = Number(res.lastInsertRowid);

  return {
    shift_id: newShiftId,
    user_id: userId || 1,
    user_name: userName || 'د. مريم الحميلي',
    start_time: timestamp,
    end_time: null,
    status: 'OPEN',
    opening_balance: openBal,
    actual_cash_counted: null,
    discrepancy: 0,
    total_sales: 0,
    cash_sales: 0,
    card_sales: 0,
    credit_sales: 0,
    returns_amount: 0,
    expenses_amount: 0,
    notes: null
  };
}

/**
 * 5. Work Shifts: Close Shift & Calculate Discrepancy
 */
export function closeShift(shiftId: number, actualCashCounted: number, notes?: string): WorkShift {
  const database = getDatabaseInstance();

  const tx = database.transaction(() => {
    const shift = database.prepare('SELECT * FROM work_shifts WHERE shift_id = ?').get(shiftId) as any;
    if (!shift) {
      throw new Error(`الوردية رقم #${shiftId} غير موجودة.`);
    }

    const shiftStartDate = shift.start_time.split(' ')[0] || getLocalDateTime().date;

    const salesStats = database.prepare(`
      SELECT 
        COALESCE(SUM(total_selling_price - discount), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method IN ('نقدي', 'دليفري') THEN (total_selling_price - discount) ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'فيزا' THEN (total_selling_price - discount) ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'آجل' THEN (total_selling_price - discount) ELSE 0 END), 0) as credit_sales
      FROM sales_invoices 
      WHERE (invoice_time >= ? OR (invoice_date >= ? AND invoice_time IS NULL))
    `).get(shift.start_time, shiftStartDate) as { total_sales: number; cash_sales: number; card_sales: number; credit_sales: number };

    const expenses = (database.prepare(`
      SELECT COALESCE(SUM(debit), 0) as total 
      FROM general_ledger_2026 
      WHERE entry_date >= ? AND account_name LIKE 'مصروفات%'
    `).get(shiftStartDate) as { total: number }).total;

    const returnsFromSalesReturns = (database.prepare(`
      SELECT COALESCE(SUM(refund_amount), 0) as total 
      FROM sales_returns 
      WHERE return_timestamp >= ? AND payment_method IN ('نقدي', 'دليفري')
    `).get(shift.start_time) as { total: number }).total;

    const legacyStartTime = shift.start_time.startsWith('20') ? shift.start_time.slice(2) : shift.start_time;
    const legacyReturns = (database.prepare(`
      SELECT COALESCE(SUM(unit_price * fraction), 0) as total 
      FROM undo_sales_history 
      WHERE sale_timestamp >= ?
    `).get(legacyStartTime) as { total: number }).total;

    const returns = Math.round((returnsFromSalesReturns + legacyReturns) * 100) / 100;
    const openingBalance = shift.opening_balance || 0;
    const expectedCash = Math.round((openingBalance + salesStats.cash_sales - returns - expenses) * 100) / 100;
    const discrepancy = Math.round((actualCashCounted - expectedCash) * 100) / 100;

    const local = getLocalDateTime();
    const endTime = local.timestamp;

    database.prepare(`
      UPDATE work_shifts 
      SET 
        end_time = ?,
        status = 'CLOSED',
        actual_cash_counted = ?,
        discrepancy = ?,
        total_sales = ?,
        cash_sales = ?,
        card_sales = ?,
        credit_sales = ?,
        returns_amount = ?,
        expenses_amount = ?,
        notes = ?
      WHERE shift_id = ?
    `).run(
      endTime,
      actualCashCounted,
      discrepancy,
      salesStats.total_sales,
      salesStats.cash_sales,
      salesStats.card_sales,
      salesStats.credit_sales,
      returns,
      expenses,
      notes || '',
      shiftId
    );

    return {
      shift_id: shiftId,
      user_id: shift.user_id,
      user_name: shift.user_name,
      start_time: shift.start_time,
      end_time: endTime,
      status: 'CLOSED' as const,
      opening_balance: openingBalance,
      actual_cash_counted: actualCashCounted,
      discrepancy: discrepancy,
      total_sales: salesStats.total_sales,
      cash_sales: salesStats.cash_sales,
      card_sales: salesStats.card_sales,
      credit_sales: salesStats.credit_sales,
      returns_amount: returns,
      expenses_amount: expenses,
      notes: notes || null
    };
  });

  return tx();
}

/**
 * 6. Work Shifts: Get Shifts History
 */
export function getShiftsHistory(limit = 30): WorkShift[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT * FROM work_shifts 
    ORDER BY shift_id DESC 
    LIMIT ?
  `).all(limit) as WorkShift[];
}

/**
 * 7. Customers: Get Customers with Balances
 */
export function getCustomersWithBalances(searchQuery?: string): Customer[] {
  const database = getDatabaseInstance();

  if (searchQuery && searchQuery.trim()) {
    const q = `%${searchQuery.trim()}%`;
    return database.prepare(`
      SELECT customer_id, customer_name, phone, address, account_balance
      FROM customers
      WHERE customer_name LIKE ? OR phone LIKE ?
      ORDER BY customer_name ASC
    `).all(q, q) as Customer[];
  }

  return database.prepare(`
    SELECT customer_id, customer_name, phone, address, account_balance
    FROM customers
    ORDER BY customer_name ASC
  `).all() as Customer[];
}

/**
 * 8. Customers: Record Customer Debt Payment
 */
export function recordCustomerPayment(customerId: number, amount: number, notes?: string): {
  success: boolean;
  new_balance: number;
  new_customer_balance: number;
} {
  const database = getDatabaseInstance();

  if (!amount || amount <= 0 || isNaN(amount)) {
    throw new Error('مبلغ سداد العميل يجب أن يكون أكبر من الصفر.');
  }

  const tx = database.transaction(() => {
    const customer = database.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId) as Customer | undefined;
    if (!customer) {
      throw new Error(`العميل رقم #${customerId} غير موجود.`);
    }

    const newCustomerBalance = Math.round((customer.account_balance - amount) * 100) / 100;
    database.prepare('UPDATE customers SET account_balance = ? WHERE customer_id = ?').run(newCustomerBalance, customerId);

    // Add to treasury
    const treasuryRow = database.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number };
    const currentTreasury = treasuryRow ? treasuryRow.cash_balance : 119242.5;
    const newTreasuryBalance = Math.round((currentTreasury + amount) * 100) / 100;

    const local = getLocalDateTime();
    const entryDate = local.date;
    const timestamp = local.timestamp;

    database.prepare('UPDATE treasury_state SET cash_balance = ?, last_updated = ? WHERE id = 1').run(newTreasuryBalance, timestamp);

    // Double entry ledger (Debit Cash, Credit Customers)
    const maxEntryId = (database.prepare('SELECT COALESCE(MAX(entry_id), 0) as m FROM general_ledger_2026').get() as { m: number }).m;
    const seq = (database.prepare('SELECT COUNT(*) as c FROM general_ledger_2026 WHERE entry_date = ?').get(entryDate) as { c: number }).c + 1;
    const docRef = `PAY-CUST-${customerId}-${entryDate.replace(/-/g, '')}-${seq}`;

    try {
      // 1. Debit Cash
      database.prepare(`
        INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
        VALUES (?, ?, 'اصول.متداولة.نقدية.كاش', ?, ?, ?, ?, 0)
      `).run(maxEntryId + 1, entryDate, docRef, `تحصيل نقدي من العميل: ${customer.customer_name} - ${notes || ''}`, amount, amount);

      // 2. Credit Accounts Receivable
      database.prepare(`
        INSERT OR IGNORE INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
        VALUES (?, ?, 'اصول.متداولة.عملاء', ?, ?, ?, 0, ?)
      `).run(maxEntryId + 2, entryDate, docRef, `سداد مديونية العميل: ${customer.customer_name}`, -amount, amount);
    } catch (glErr: unknown) {
      const msg = glErr instanceof Error ? glErr.message : String(glErr);
      if (!msg.includes('UNIQUE constraint failed')) {
        console.error('Error posting customer payment to general_ledger_2026:', glErr);
      }
    }

    // Record in customer_ledger
    database.prepare(`
      INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, notes)
      VALUES (?, ?, 'PAYMENT', ?, ?)
    `).run(customerId, timestamp, amount, notes || 'سداد دفعة نقدية');

    return {
      success: true,
      new_balance: newTreasuryBalance,
      new_customer_balance: newCustomerBalance
    };
  });

  return tx();
}

/**
 * 9. Delivery: Get Delivery Orders List
 */
export function getDeliveryOrders(statusFilter?: string, searchQuery?: string, limit = 50): DeliveryOrder[] {
  const database = getDatabaseInstance();

  let query = 'SELECT * FROM delivery_orders WHERE 1=1';
  const params: any[] = [];

  if (statusFilter && statusFilter !== 'ALL') {
    query += ' AND status = ?';
    params.push(statusFilter);
  }

  if (searchQuery && searchQuery.trim()) {
    query += ' AND (customer_name LIKE ? OR phone LIKE ? OR item_ordered LIKE ?)';
    const q = `%${searchQuery.trim()}%`;
    params.push(q, q, q);
  }

  query += ' ORDER BY order_id DESC LIMIT ?';
  params.push(limit);

  return database.prepare(query).all(...params) as DeliveryOrder[];
}

/**
 * 10. Delivery: Update Order Status
 */
export function updateDeliveryStatus(orderId: number, newStatus: string): { success: boolean; order_id: number; status: string } {
  const database = getDatabaseInstance();
  database.prepare('UPDATE delivery_orders SET status = ? WHERE order_id = ?').run(newStatus, orderId);
  return { success: true, order_id: orderId, status: newStatus };
}

/**
 * 11. Reports Engine: Comprehensive Financial Report
 */
export function getFinancialReport(startDate?: string, endDate?: string): FinancialReport {
  const database = getDatabaseInstance();

  const local = getLocalDateTime();
  const today = local.date;
  const start = startDate || '2026-01-01';
  const end = endDate || today;

  // 1. Sales totals (net of invoice discount) & count
  const salesRow = database.prepare(`
    SELECT 
      COALESCE(SUM(total_selling_price - discount), 0) as total_sales,
      COUNT(*) as invoices_count
    FROM sales_invoices
    WHERE invoice_date >= ? AND invoice_date <= ?
  `).get(start, end) as { total_sales: number; invoices_count: number };

  // Sales returns in the period
  const returnsRow = database.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) as total_returns
    FROM sales_returns
    WHERE return_date >= ? AND return_date <= ?
  `).get(start, end) as { total_returns: number };

  const netSales = Math.max(0, Math.round((salesRow.total_sales - returnsRow.total_returns) * 100) / 100);

  // 2. Cost of Goods Sold (COGS) with effective buy price fallback
  const cogsRow = database.prepare(`
    SELECT COALESCE(SUM(
      CASE 
        WHEN sii.cost_price > 0 AND sii.cost_price >= (sii.unit_price * 0.35) THEN sii.cost_price * sii.quantity
        ELSE (
          CASE 
            WHEN i.buy_price <= 0 OR i.buy_price < (i.consumer_price * 0.35) THEN
              (i.consumer_price * (1.0 - (COALESCE(NULLIF(i.discount_pct, 0), NULLIF(i.pharmacy_discount_percent, 0), 25) / 100.0))) * (
                CASE WHEN sii.unit_type = 'شريط' AND i.package_units > 1 THEN sii.quantity / i.package_units ELSE sii.quantity END
              )
            ELSE (
              CASE WHEN sii.unit_type = 'شريط' AND i.package_units > 1 THEN (i.buy_price / i.package_units) * sii.quantity ELSE i.buy_price * sii.quantity END
            )
          END
        )
      END
    ), 0) as cogs
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON sii.invoice_number = si.invoice_number
    LEFT JOIN items i ON sii.item_id = i.item_id
    WHERE si.invoice_date >= ? AND si.invoice_date <= ?
  `).get(start, end) as { cogs: number };

  // Deduct returned items cost from COGS
  const returnedCogsRow = database.prepare(`
    SELECT COALESCE(SUM(
      sr.quantity * CASE 
        WHEN sii.cost_price > 0 THEN sii.cost_price 
        ELSE (
          CASE 
            WHEN i.buy_price <= 0 OR i.buy_price < (i.consumer_price * 0.35) THEN
              (i.consumer_price * (1.0 - (COALESCE(NULLIF(i.discount_pct, 0), NULLIF(i.pharmacy_discount_percent, 0), 25) / 100.0))) * (
                CASE WHEN sr.unit_type = 'شريط' AND i.package_units > 1 THEN 1.0 / i.package_units ELSE 1.0 END
              )
            ELSE (
              CASE WHEN sr.unit_type = 'شريط' AND i.package_units > 1 THEN (i.buy_price / i.package_units) ELSE i.buy_price END
            )
          END
        )
      END
    ), 0) as returned_cogs
    FROM sales_returns sr
    LEFT JOIN sales_invoice_items sii ON sr.invoice_number = sii.invoice_number AND sr.item_id = sii.item_id
    LEFT JOIN items i ON sr.item_id = i.item_id
    WHERE sr.return_date >= ? AND sr.return_date <= ?
  `).get(start, end) as { returned_cogs: number };

  const netCogs = Math.max(0, Math.round((cogsRow.cogs - (returnedCogsRow?.returned_cogs || 0)) * 100) / 100);
  const grossProfit = Math.round((netSales - netCogs) * 100) / 100;
  const grossMarginPct = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(1)) : 0;

  // 3. Purchases totals
  const purchasesRow = database.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total_purchases
    FROM purchases_invoices
    WHERE invoice_date >= ? AND invoice_date <= ?
  `).get(start, end) as { total_purchases: number };

  // 4. Operating Expenses from General Ledger
  const expensesRow = database.prepare(`
    SELECT COALESCE(SUM(debit), 0) as total_expenses
    FROM general_ledger_2026
    WHERE entry_date >= ? AND entry_date <= ? AND account_name LIKE 'مصروفات%'
  `).get(start, end) as { total_expenses: number };

  const totalPurchases = purchasesRow.total_purchases;
  const totalExpenses = expensesRow.total_expenses;
  const netProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;
  const netCashFlow = Math.round((netSales - totalPurchases - totalExpenses) * 100) / 100;

  // 5. Daily Breakdown
  const dailyRows = database.prepare(`
    SELECT 
      si.invoice_date as date,
      COALESCE(SUM(si.total_selling_price - si.discount), 0) as sales,
      COALESCE(SUM(si.profit), 0) as profit
    FROM sales_invoices si
    WHERE si.invoice_date >= ? AND si.invoice_date <= ?
    GROUP BY si.invoice_date
    ORDER BY si.invoice_date DESC
    LIMIT 30
  `).all(start, end) as Array<{ date: string; sales: number; profit: number }>;

  const dailyBreakdown = dailyRows.map(r => {
    const dayExp = (database.prepare(`
      SELECT COALESCE(SUM(debit), 0) as exp
      FROM general_ledger_2026
      WHERE entry_date = ? AND account_name LIKE 'مصروفات%'
    `).get(r.date) as { exp: number }).exp;

    const dayRet = (database.prepare(`
      SELECT COALESCE(SUM(refund_amount), 0) as ret
      FROM sales_returns
      WHERE return_date = ?
    `).get(r.date) as { ret: number }).ret;

    return {
      date: r.date,
      sales: Math.round((r.sales - dayRet) * 100) / 100,
      profit: Math.round((r.profit - dayRet) * 100) / 100,
      expenses: dayExp
    };
  });

  return {
    startDate: start,
    endDate: end,
    total_sales: netSales,
    cogs: netCogs,
    gross_profit: grossProfit,
    gross_margin_pct: grossMarginPct,
    total_purchases: totalPurchases,
    total_expenses: totalExpenses,
    net_profit: netProfit,
    net_cash_flow: netCashFlow,
    invoices_count: salesRow.invoices_count,
    daily_breakdown: dailyBreakdown
  };
}

/**
 * 12. Reports Engine: Top Moving and Stagnant Items
 */
export function getTopMovingAndStagnantItems(limit = 10): {
  topItems: TopItem[];
  stagnantItems: StagnantItem[];
} {
  const database = getDatabaseInstance();

  const topItems = database.prepare(`
    SELECT 
      sii.item_id,
      COALESCE(i.item_name_en, sii.item_name) as item_name_en,
      i.item_name_ar,
      SUM(sii.quantity) as total_quantity_sold,
      SUM(sii.quantity * sii.unit_price) as total_revenue,
      SUM(sii.quantity * (sii.unit_price - COALESCE(i.buy_price, 0))) as total_profit,
      COALESCE(i.current_stock, 0) as current_stock
    FROM sales_invoice_items sii
    LEFT JOIN items i ON sii.item_id = i.item_id
    WHERE sii.item_id > 1 -- Exclude generic filling item #1
    GROUP BY sii.item_id
    ORDER BY total_quantity_sold DESC
    LIMIT ?
  `).all(limit) as TopItem[];

  const stagnantItems = database.prepare(`
    SELECT 
      item_id,
      item_name_en,
      item_name_ar,
      current_stock,
      consumer_price,
      buy_price,
      producer
    FROM items
    WHERE current_stock >= 15
      AND item_id NOT IN (SELECT DISTINCT item_id FROM sales_invoice_items)
    ORDER BY current_stock DESC
    LIMIT ?
  `).all(limit) as StagnantItem[];

  return {
    topItems,
    stagnantItems
  };
}

/**
 * 13. Reports Engine: Stock Valuation and Expiry Report
 */
export function getExpiryAndStockValuationReport(): StockValuationReport {
  const database = getDatabaseInstance();

  // In-stock items valuation (1,877 items) with effective buy price fallback
  const inStockStats = database.prepare(`
    SELECT 
      COUNT(*) as total_items,
      COALESCE(SUM(current_stock), 0) as total_pieces,
      COALESCE(SUM(current_stock * (
        CASE 
          WHEN buy_price <= 0 OR buy_price < (consumer_price * 0.35) THEN 
            consumer_price * (1.0 - (COALESCE(NULLIF(discount_pct, 0), NULLIF(pharmacy_discount_percent, 0), 25) / 100.0))
          ELSE buy_price
        END
      )), 0) as total_cost,
      COALESCE(SUM(current_stock * consumer_price), 0) as total_consumer
    FROM items 
    WHERE current_stock > 0
  `).get() as { total_items: number; total_pieces: number; total_cost: number; total_consumer: number };

  const totalCost = Number(inStockStats.total_cost.toFixed(2));
  const totalConsumer = Number(inStockStats.total_consumer.toFixed(2));
  const potentialProfit = Number((totalConsumer - totalCost).toFixed(2));

  // Expiry check across items
  const allItemsWithExpiry = database.prepare(`
    SELECT 
      item_id, 
      item_name_en, 
      item_name_ar, 
      expiry_date, 
      current_stock, 
      consumer_price, 
      (
        CASE 
          WHEN buy_price <= 0 OR buy_price < (consumer_price * 0.35) THEN 
            consumer_price * (1.0 - (COALESCE(NULLIF(discount_pct, 0), NULLIF(pharmacy_discount_percent, 0), 25) / 100.0))
          ELSE buy_price
        END
      ) as buy_price
    FROM items 
    WHERE expiry_date IS NOT NULL AND expiry_date != ''
  `).all() as Array<{
    item_id: number;
    item_name_en: string;
    item_name_ar?: string;
    expiry_date: string;
    current_stock: number;
    consumer_price: number;
    buy_price: number;
  }>;

  const now = new Date();
  const m3 = new Date();
  m3.setMonth(now.getMonth() + 3);
  const m6 = new Date();
  m6.setMonth(now.getMonth() + 6);

  let expiredCount = 0;
  let near3mCount = 0;
  let near6mCount = 0;
  const flaggedItems: NearExpiryItem[] = [];

  for (const item of allItemsWithExpiry) {
    const parts = item.expiry_date.split('-');
    if (parts.length !== 2) continue;
    const m = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    if (isNaN(m) || isNaN(y)) continue;

    const exp = new Date(y, m, 0);
    let urgency: 'EXPIRED' | 'CRITICAL' | 'WARNING' | null = null;

    if (exp < now) {
      expiredCount++;
      urgency = 'EXPIRED';
    } else if (exp <= m3) {
      near3mCount++;
      urgency = 'CRITICAL';
    } else if (exp <= m6) {
      near6mCount++;
      urgency = 'WARNING';
    }

    if (urgency) {
      flaggedItems.push({
        item_id: item.item_id,
        item_name_en: item.item_name_en,
        item_name_ar: item.item_name_ar,
        expiry_date: item.expiry_date,
        current_stock: item.current_stock,
        consumer_price: item.consumer_price,
        buy_price: item.buy_price,
        urgency: urgency
      });
    }
  }

  // Sort flagged items by urgency
  flaggedItems.sort((a, b) => {
    const order = { EXPIRED: 1, CRITICAL: 2, WARNING: 3 };
    return order[a.urgency] - order[b.urgency];
  });

  return {
    total_in_stock_items: inStockStats.total_items,
    total_pieces: inStockStats.total_pieces,
    total_cost_value: totalCost,
    total_consumer_value: totalConsumer,
    potential_profit: potentialProfit,
    expired_count: expiredCount,
    near_expiry_3m_count: near3mCount,
    near_expiry_6m_count: near6mCount,
    near_expiry_items: flaggedItems.slice(0, 100)
  };
}

/**
 * 14. Users and Audit Logs: Price Changes & Voids/Returns
 */
export function getUsersAndAuditLogs(limit = 50): {
  users: UserAccount[];
  auditLogs: AuditLogs;
} {
  const database = getDatabaseInstance();

  const users = database.prepare(`
    SELECT user_id, user_name, is_active, permissions_mask, role, allowed_tabs, badge_barcode, max_discount_pct, commission_pct
    FROM users
    ORDER BY is_active DESC, user_id ASC
  `).all() as UserAccount[];

  const priceChanges = database.prepare(`
    SELECT 
      pch.id,
      pch.item_id,
      COALESCE(i.item_name_en, 'صنف رقم ' || pch.item_id) as item_name_en,
      pch.old_price,
      pch.new_price,
      pch.change_timestamp as changed_at
    FROM price_change_history pch
    LEFT JOIN items i ON pch.item_id = i.item_id
    ORDER BY pch.id DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    item_id: number;
    item_name_en: string;
    old_price: number;
    new_price: number;
    changed_at: string;
  }>;

  const voidsAndReturns = database.prepare(`
    SELECT id, sale_timestamp, user_name, item_name, unit_price, invoice_id
    FROM undo_sales_history
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    sale_timestamp: string;
    user_name: string;
    item_name: string;
    unit_price: number;
    invoice_id?: number;
  }>;

  const stockAdjustments = database.prepare(`
    SELECT id, item_id, item_name, old_stock, new_stock, difference, reason, user_name, adjusted_at
    FROM inventory_adjustments_log
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    item_id: number;
    item_name: string;
    old_stock: number;
    new_stock: number;
    difference: number;
    reason: string;
    user_name: string;
    adjusted_at: string;
  }>;

  return {
    users,
    auditLogs: {
      price_changes: priceChanges,
      voids_and_returns: voidsAndReturns,
      stock_adjustments: stockAdjustments
    }
  };
}

// ============================================================================
// MODULE 1: RBAC LOGIN, MANAGER ELEVATION & USER ACCOUNT MANAGEMENT
// ============================================================================

const DEFAULT_TABS_BY_ROLE: Record<UserRole, string[]> = {
  ADMIN: ['dashboard', 'pos', 'sales_invoices', 'catalog', 'purchases', 'shortages', 'treasury', 'reports'],
  PHARMACIST: ['pos', 'sales_invoices', 'catalog', 'purchases', 'shortages'],
  CASHIER: ['pos', 'sales_invoices', 'shortages']
};

const DEFAULT_DISCOUNT_BY_ROLE: Record<UserRole, number> = {
  ADMIN: 100,
  PHARMACIST: 10,
  CASHIER: 3
};

function normalizeUserRole(raw?: string | null): UserRole {
  if (raw === 'ADMIN' || raw === 'PHARMACIST' || raw === 'CASHIER') {
    return raw;
  }
  return 'CASHIER';
}

function parseAllowedTabs(rawTabs: string | null | undefined, role: UserRole): string[] {
  if (rawTabs) {
    try {
      const parsed = JSON.parse(rawTabs);
      if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string')) {
        return parsed;
      }
    } catch {
      // Fallback to role defaults
    }
  }
  return [...DEFAULT_TABS_BY_ROLE[role]];
}

function recordLoginAuditEvent(
  database: Database.Database,
  entry: {
    user_id: number;
    user_name: string;
    action_type: LoginAuditEntry['action_type'];
    authorized_by_id?: number | null;
    authorized_by_name?: string;
    target_ref?: string;
  }
): void {
  const { timestamp } = getLocalDateTime();
  database.prepare(`
    INSERT INTO login_audit_log (
      user_id, user_name, action_type, authorized_by_id, authorized_by_name, target_ref, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.user_id,
    entry.user_name,
    entry.action_type,
    entry.authorized_by_id ?? null,
    entry.authorized_by_name || '',
    entry.target_ref || '',
    timestamp
  );
}

/**
 * Return active user accounts (safe projection excluding PIN codes).
 */
export function listActiveUsers(): UserAccount[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT user_id, user_name, is_active, permissions_mask, role, allowed_tabs, badge_barcode, max_discount_pct, commission_pct
    FROM users
    WHERE is_active = 1
    ORDER BY
      CASE role WHEN 'ADMIN' THEN 1 WHEN 'PHARMACIST' THEN 2 ELSE 3 END ASC,
      user_id ASC
  `).all() as UserAccount[];
}

/**
 * Authenticate user by user_id or badge_barcode and PIN code.
 */
export function authenticateUser(userIdOrBadge: number | string, pinCode: string): AuthSession {
  const database = getDatabaseInstance();
  const key = String(userIdOrBadge ?? '').trim();
  const cleanPin = String(pinCode ?? '').trim();

  if (!key) {
    throw new Error('يرجى اختيار المستخدم أو مسح باركود الكارنيه.');
  }

  let userRow: (UserAccount & { pin_code?: string }) | undefined;
  if (/^\d+$/.test(key)) {
    userRow = database.prepare(`
      SELECT user_id, user_name, is_active, permissions_mask, role, allowed_tabs, badge_barcode, max_discount_pct, commission_pct, pin_code
      FROM users WHERE user_id = ? AND is_active = 1 LIMIT 1
    `).get(parseInt(key, 10)) as (UserAccount & { pin_code?: string }) | undefined;
  }
  if (!userRow) {
    userRow = database.prepare(`
      SELECT user_id, user_name, is_active, permissions_mask, role, allowed_tabs, badge_barcode, max_discount_pct, commission_pct, pin_code
      FROM users WHERE UPPER(badge_barcode) = UPPER(?) AND is_active = 1 LIMIT 1
    `).get(key) as (UserAccount & { pin_code?: string }) | undefined;
  }

  if (!userRow) {
    throw new Error('المستخدم غير موجود أو غير نشط.');
  }

  const storedPin = String(userRow.pin_code || '').trim();
  if (!cleanPin || cleanPin !== storedPin) {
    recordLoginAuditEvent(database, {
      user_id: userRow.user_id,
      user_name: userRow.user_name,
      action_type: 'FAILED_PIN',
      target_ref: 'LOGIN'
    });
    throw new Error('كود الدخول (PIN) غير صحيح.');
  }

  const role = normalizeUserRole(userRow.role);
  const allowedTabs = parseAllowedTabs(userRow.allowed_tabs, role);
  const { timestamp } = getLocalDateTime();

  recordLoginAuditEvent(database, {
    user_id: userRow.user_id,
    user_name: userRow.user_name,
    action_type: 'LOGIN'
  });

  return {
    user_id: userRow.user_id,
    user_name: userRow.user_name,
    role,
    allowed_tabs: allowedTabs,
    max_discount_pct: Number(userRow.max_discount_pct ?? DEFAULT_DISCOUNT_BY_ROLE[role]),
    badge_barcode: userRow.badge_barcode || `EMP-${userRow.user_id}`,
    logged_in_at: timestamp
  };
}

/**
 * Authorize a single privileged operation ("الدخول كمدير") without logging out the current cashier.
 */
export function verifyManagerOverride(
  pinCode: string,
  currentUserId: number,
  actionLabel: string,
  targetRef: string = ''
): { ok: boolean; managerId: number; managerName: string } {
  const database = getDatabaseInstance();
  const cleanPin = String(pinCode ?? '').trim();
  const requester = database
    .prepare('SELECT user_id, user_name FROM users WHERE user_id = ?')
    .get(currentUserId) as { user_id: number; user_name: string } | undefined;

  if (!cleanPin) {
    throw new Error('يرجى إدخال الرقم السري للمدير.');
  }

  const manager = database.prepare(`
    SELECT user_id, user_name
    FROM users
    WHERE is_active = 1 AND role = 'ADMIN' AND pin_code = ?
    ORDER BY user_id ASC
    LIMIT 1
  `).get(cleanPin) as { user_id: number; user_name: string } | undefined;

  if (!manager) {
    recordLoginAuditEvent(database, {
      user_id: requester?.user_id || currentUserId || 0,
      user_name: requester?.user_name || 'غير معروف',
      action_type: 'FAILED_PIN',
      target_ref: `OVERRIDE:${actionLabel}${targetRef ? ` (${targetRef})` : ''}`
    });
    throw new Error('كود المدير غير صحيح أو لا يملك صلاحية الإدارة.');
  }

  recordLoginAuditEvent(database, {
    user_id: requester?.user_id || currentUserId || 0,
    user_name: requester?.user_name || manager.user_name,
    action_type: 'MANAGER_OVERRIDE',
    authorized_by_id: manager.user_id,
    authorized_by_name: manager.user_name,
    target_ref: `${actionLabel}${targetRef ? ` (${targetRef})` : ''}`
  });

  return {
    ok: true,
    managerId: manager.user_id,
    managerName: manager.user_name
  };
}

/**
 * Create or update a pharmacy staff account (Admin management).
 */
export function saveOrUpdateUserAccount(payload: SaveUserPayload): UserAccount {
  const database = getDatabaseInstance();
  const name = (payload.user_name || '').trim();
  if (!name) {
    throw new Error('اسم المستخدم مطلوب.');
  }

  const role = normalizeUserRole(payload.role);
  const tabsJson = JSON.stringify(
    payload.allowed_tabs && payload.allowed_tabs.length > 0
      ? payload.allowed_tabs
      : DEFAULT_TABS_BY_ROLE[role]
  );
  const maxDisc = payload.max_discount_pct ?? DEFAULT_DISCOUNT_BY_ROLE[role];
  const commissionPct = Math.max(0, Number(payload.commission_pct ?? 0));
  const isActive = payload.is_active === 0 ? 0 : 1;

  if (payload.user_id && payload.user_id > 0) {
    const existing = database.prepare('SELECT user_id, pin_code, badge_barcode FROM users WHERE user_id = ?').get(payload.user_id) as {
      user_id: number;
      pin_code?: string;
      badge_barcode?: string;
    } | undefined;
    if (!existing) {
      throw new Error(`المستخدم رقم #${payload.user_id} غير موجود.`);
    }

    const nextPin = payload.pin_code && payload.pin_code.trim() ? payload.pin_code.trim() : (existing.pin_code || '1234');
    const nextBadge = existing.badge_barcode && existing.badge_barcode.trim()
      ? existing.badge_barcode
      : `EMP-${payload.user_id}`;

    database.prepare(`
      UPDATE users
      SET user_name = ?, pin_code = ?, role = ?, allowed_tabs = ?, badge_barcode = ?, max_discount_pct = ?, commission_pct = ?, is_active = ?
      WHERE user_id = ?
    `).run(name, nextPin, role, tabsJson, nextBadge, maxDisc, commissionPct, isActive, payload.user_id);

    return database.prepare(`
      SELECT user_id, user_name, is_active, permissions_mask, role, allowed_tabs, badge_barcode, max_discount_pct, commission_pct
      FROM users WHERE user_id = ?
    `).get(payload.user_id) as UserAccount;
  }

  const cleanPin = (payload.pin_code || '').trim();
  if (!cleanPin || cleanPin.length < 4) {
    throw new Error('كود الدخول (PIN) يجب أن يكون 4 أرقام على الأقل.');
  }

  const maxRow = database.prepare('SELECT COALESCE(MAX(user_id), 0) as maxId FROM users').get() as { maxId: number };
  const newId = maxRow.maxId + 1;
  const badge = `EMP-${newId}`;

  database.prepare(`
    INSERT INTO users (
      user_id, user_name, is_active, permissions_mask, pin_code, role, allowed_tabs, badge_barcode, max_discount_pct, commission_pct
    ) VALUES (?, ?, ?, 8224, ?, ?, ?, ?, ?, ?)
  `).run(newId, name, isActive, cleanPin, role, tabsJson, badge, maxDisc, commissionPct);

  return database.prepare(`
    SELECT user_id, user_name, is_active, permissions_mask, role, allowed_tabs, badge_barcode, max_discount_pct, commission_pct
    FROM users WHERE user_id = ?
  `).get(newId) as UserAccount;
}

export function getLoginAuditLogs(limit: number = 100): LoginAuditEntry[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT id, user_id, user_name, action_type, authorized_by_id, authorized_by_name, target_ref, created_at
    FROM login_audit_log
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as LoginAuditEntry[];
}

// ============================================================================
// MODULE 2: SUPPLIERS STATEMENT, PAYMENTS & PURCHASE / EXPIRY RETURNS
// ============================================================================

function roundMoney(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

interface GlPostingLine {
  account_name: string;
  notes: string;
  debit: number;
  credit: number;
}

/**
 * Shared atomic GL poster enforcing double-entry equality (sum(debit) == sum(credit)).
 */
function postBalancedGlLines(
  database: Database.Database,
  entryDate: string,
  documentRef: string,
  lines: GlPostingLine[]
): number {
  const activeLines = lines.filter((l) => roundMoney(l.debit) > 0 || roundMoney(l.credit) > 0);
  if (activeLines.length === 0) return 0;

  const totalDebit = roundMoney(activeLines.reduce((acc, l) => acc + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(activeLines.reduce((acc, l) => acc + roundMoney(l.credit), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Unbalanced GL posting for ${documentRef}: Debit=${totalDebit} Credit=${totalCredit}`);
  }

  let nextEntryId = (
    database.prepare('SELECT COALESCE(MAX(entry_id), 0) as m FROM general_ledger_2026').get() as { m: number }
  ).m;

  const stmt = database.prepare(`
    INSERT INTO general_ledger_2026 (entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of activeLines) {
    nextEntryId++;
    const debit = roundMoney(line.debit);
    const credit = roundMoney(line.credit);
    const signedAmount = roundMoney(debit - credit);
    stmt.run(nextEntryId, entryDate, line.account_name, documentRef, line.notes, signedAmount, debit, credit);
  }

  return nextEntryId;
}

/**
 * Unified suppliers GL balance covering both legacy 'خصوم.متداولة.موردين.الكل' and modern 'خصوم.متداولة.موردين'.
 */
export function getTotalSuppliersGlPayable(database?: Database.Database): number {
  const d = database || getDatabaseInstance();
  const row = d.prepare(`
    SELECT COALESCE(ROUND(SUM(credit - debit), 2), 0) as bal
    FROM general_ledger_2026
    WHERE account_name LIKE 'خصوم.متداولة.موردين%'
  `).get() as { bal: number };
  return roundMoney(row?.bal ?? 0);
}

/**
 * Detailed chronological statement for a supplier with running balance & unified GL payable.
 */
export function getSupplierStatement(
  supplierId: number,
  fromDate?: string,
  toDate?: string
): SupplierStatementReport {
  const database = getDatabaseInstance();
  const supplier = getSuppliers().find((s) => s.supplier_id === supplierId);
  if (!supplier) {
    throw new Error(`المورد رقم #${supplierId} غير موجود.`);
  }

  const openingBalance = roundMoney(supplier.opening_balance ?? 0);
  const rawEntries: Array<Omit<SupplierStatementEntry, 'running_balance'> & { sortKey: string }> = [];

  if (openingBalance !== 0) {
    rawEntries.push({
      entry_key: 'OPENING',
      date: '0000-00-00',
      sortKey: '0000-00-00-0',
      type: 'OPENING',
      label: 'رصيد أول المدة',
      reference: `SUP-${supplierId}`,
      credit_effect: openingBalance > 0 ? openingBalance : 0,
      debit_effect: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      notes: 'رصيد مرحل'
    });
  }

  const purchases = database.prepare(`
    SELECT purchase_invoice_id, invoice_date, total_amount, paper_invoice_number, payment_method, notes
    FROM purchases_invoices
    WHERE supplier_id = ?
    ORDER BY invoice_date ASC, purchase_invoice_id ASC
  `).all(supplierId) as Array<{
    purchase_invoice_id: number;
    invoice_date: string;
    total_amount: number;
    paper_invoice_number?: string;
    payment_method?: string;
    notes?: string;
  }>;

  let totalPurchasesCredit = 0;
  let totalPurchasesCash = 0;

  for (const inv of purchases) {
    const isCash = inv.payment_method === 'نقدي' || inv.payment_method === 'CASH';
    const amt = roundMoney(inv.total_amount);
    if (isCash) {
      totalPurchasesCash = roundMoney(totalPurchasesCash + amt);
    } else {
      totalPurchasesCredit = roundMoney(totalPurchasesCredit + amt);
    }

    rawEntries.push({
      entry_key: `PUR-${inv.purchase_invoice_id}`,
      date: inv.invoice_date || '',
      sortKey: `${inv.invoice_date || '1900-01-01'}-1-${String(inv.purchase_invoice_id).padStart(8, '0')}`,
      type: isCash ? 'PURCHASE_CASH' : 'PURCHASE_CREDIT',
      label: isCash ? 'فاتورة مشتريات نقدية' : 'فاتورة مشتريات آجل',
      reference: inv.paper_invoice_number ? `#${inv.purchase_invoice_id} (${inv.paper_invoice_number})` : `#${inv.purchase_invoice_id}`,
      credit_effect: isCash ? 0 : amt,
      debit_effect: 0,
      notes: isCash ? `مدفوعة نقداً (${amt.toFixed(2)} ج.م)${inv.notes ? ` - ${inv.notes}` : ''}` : (inv.notes || '')
    });
  }

  const payments = database.prepare(`
    SELECT id, transaction_date, amount, notes
    FROM supplier_transactions
    WHERE supplier_id = ?
      AND transaction_type IN ('سداد دفعة مورد', 'سداد دفعة نقدية')
    ORDER BY transaction_date ASC, id ASC
  `).all(supplierId) as Array<{
    id: number;
    transaction_date: string;
    amount: number;
    notes?: string;
  }>;

  let totalPayments = 0;
  for (const p of payments) {
    const amt = roundMoney(Math.abs(p.amount));
    totalPayments = roundMoney(totalPayments + amt);
    const dateOnly = (p.transaction_date || '').slice(0, 10);
    rawEntries.push({
      entry_key: `PAY-${p.id}`,
      date: p.transaction_date || '',
      sortKey: `${dateOnly || '1900-01-01'}-2-${String(p.id).padStart(8, '0')}`,
      type: 'PAYMENT',
      label: 'سداد دفعة للمورد',
      reference: `SUP-PAY-${p.id}`,
      debit_effect: amt,
      credit_effect: 0,
      notes: p.notes || ''
    });
  }

  const returns = database.prepare(`
    SELECT return_id, return_type, settlement_mode, total_cost_value, credit_amount, expiry_loss_amount, return_date, notes
    FROM purchase_returns
    WHERE supplier_id = ?
    ORDER BY return_date ASC, return_id ASC
  `).all(supplierId) as PurchaseReturnRecord[];

  let totalReturnsCredit = 0;
  for (const ret of returns) {
    const creditAmt = ret.settlement_mode === 'SUPPLIER_CREDIT' ? roundMoney(ret.credit_amount) : 0;
    totalReturnsCredit = roundMoney(totalReturnsCredit + creditAmt);
    const dateOnly = (ret.return_date || '').slice(0, 10);
    rawEntries.push({
      entry_key: `RET-${ret.return_id}`,
      date: ret.return_date || '',
      sortKey: `${dateOnly || '1900-01-01'}-3-${String(ret.return_id).padStart(8, '0')}`,
      type: ret.return_type,
      label: ret.return_type === 'EXPIRY_RETURN' ? 'مرتجع إكسباير للمورد' : 'مرتجع مشتريات للمورد',
      reference: `PUR-RET-${ret.return_id}`,
      debit_effect: creditAmt,
      credit_effect: 0,
      notes: ret.settlement_mode === 'CASH_REFUND'
        ? `استرداد نقدي للخزينة (${roundMoney(ret.credit_amount).toFixed(2)} ج.م)`
        : (ret.expiry_loss_amount > 0 ? `تعويض ${roundMoney(ret.credit_amount).toFixed(2)} / هوالك ${roundMoney(ret.expiry_loss_amount).toFixed(2)}` : (ret.notes || ''))
    });
  }

  rawEntries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let running = 0;
  const fullEntries: SupplierStatementEntry[] = rawEntries.map(({ sortKey: _s, ...rest }) => {
    running = roundMoney(running + rest.credit_effect - rest.debit_effect);
    return {
      ...rest,
      running_balance: running
    };
  });

  const filteredEntries = fullEntries.filter((e) => {
    const d = e.date.slice(0, 10);
    if (e.type === 'OPENING') return true;
    if (fromDate && d && d < fromDate) return false;
    if (toDate && d && d > toDate) return false;
    return true;
  });

  return {
    supplier,
    opening_balance: openingBalance,
    total_purchases_credit: totalPurchasesCredit,
    total_purchases_cash: totalPurchasesCash,
    total_payments: totalPayments,
    total_returns_credit: totalReturnsCredit,
    closing_balance: running,
    total_gl_suppliers_payable: getTotalSuppliersGlPayable(database),
    entries: filteredEntries
  };
}

/**
 * Record cash payment to a supplier with balanced GL and treasury deduction.
 */
export function recordSupplierPayment(payload: RecordSupplierPaymentPayload): {
  success: boolean;
  tx_id: number;
  supplier_id: number;
  supplier_name: string;
  amount: number;
  new_treasury_balance: number;
} {
  const database = getDatabaseInstance();
  const amount = roundMoney(payload.amount);
  if (!payload.supplier_id || payload.supplier_id <= 0) {
    throw new Error('يرجى تحديد المورد.');
  }
  if (!amount || amount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر.');
  }

  const tx = database.transaction(() => {
    const supplier = database
      .prepare('SELECT supplier_id, supplier_name FROM suppliers WHERE supplier_id = ?')
      .get(payload.supplier_id) as { supplier_id: number; supplier_name: string } | undefined;
    if (!supplier) {
      throw new Error(`المورد رقم #${payload.supplier_id} غير موجود.`);
    }

    const treasury = database
      .prepare('SELECT cash_balance FROM treasury_state WHERE id = 1')
      .get() as { cash_balance: number } | undefined;
    const currentCash = roundMoney(treasury?.cash_balance ?? 0);
    if (currentCash < amount) {
      throw new Error(
        `نقدية الخزينة (${currentCash.toFixed(2)} ج.م) غير كافية لسداد ${amount.toFixed(2)} ج.م.`
      );
    }

    const { date, timestamp } = getLocalDateTime();
    const newCash = roundMoney(currentCash - amount);

    database.prepare(`
      UPDATE treasury_state SET cash_balance = ?, last_updated = ? WHERE id = 1
    `).run(newCash, timestamp);

    const maxTxId = (
      database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM supplier_transactions').get() as { m: number }
    ).m + 1;

    const cleanNotes = (payload.notes || '').trim() || `سداد دفعة للمورد (${payload.cashier_name || 'المدير'})`;

    database.prepare(`
      INSERT INTO supplier_transactions (id, supplier_id, supplier_name, transaction_type, amount, transaction_date, invoice_id, notes)
      VALUES (?, ?, ?, 'سداد دفعة مورد', ?, ?, 0, ?)
    `).run(maxTxId, supplier.supplier_id, supplier.supplier_name, -amount, timestamp, cleanNotes);

    postBalancedGlLines(database, date, `SUP-PAY-${maxTxId}`, [
      {
        account_name: 'خصوم.متداولة.موردين',
        notes: `سداد دفعة للمورد: ${supplier.supplier_name}${payload.notes ? ` - ${payload.notes}` : ''}`,
        debit: amount,
        credit: 0
      },
      {
        account_name: 'اصول.متداولة.نقدية.كاش',
        notes: `صرف نقدي لسداد المورد: ${supplier.supplier_name}`,
        debit: 0,
        credit: amount
      }
    ]);

    return {
      success: true,
      tx_id: maxTxId,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      amount,
      new_treasury_balance: newCash
    };
  });

  return tx();
}

/**
 * Create Purchase Return or Expiry Return to a supplier with balanced GL split.
 */
export function createPurchaseReturn(payload: CreatePurchaseReturnPayload): PurchaseReturnRecord {
  const database = getDatabaseInstance();

  if (!payload.supplier_id || payload.supplier_id <= 0) {
    throw new Error('يرجى تحديد المورد.');
  }
  if (!payload.items || payload.items.length === 0) {
    throw new Error('يجب إضافة صنف واحد على الأقل لمرتجع المشتريات.');
  }

  const rawComp = payload.compensation_pct !== undefined && payload.compensation_pct !== null
    ? Number(payload.compensation_pct)
    : 100;
  const compPct = Math.min(100, Math.max(0, rawComp));

  const tx = database.transaction(() => {
    const supplier = database
      .prepare('SELECT supplier_id, supplier_name FROM suppliers WHERE supplier_id = ?')
      .get(payload.supplier_id) as { supplier_id: number; supplier_name: string } | undefined;
    if (!supplier) {
      throw new Error(`المورد رقم #${payload.supplier_id} غير موجود.`);
    }

    const { date, timestamp } = getLocalDateTime();
    let totalCostValue = 0;

    const preparedLines = payload.items.map((line) => {
      const qty = Number(line.quantity);
      const cost = roundMoney(line.unit_cost);
      if (!line.item_id || line.item_id <= 0) {
        throw new Error('معرف الصنف غير صالح.');
      }
      if (!qty || qty <= 0 || isNaN(qty)) {
        throw new Error(`الكمية المرتجعة للصنف "${line.item_name}" يجب أن تكون أكبر من الصفر.`);
      }
      if (cost < 0 || isNaN(cost)) {
        throw new Error(`تكلفة الصنف "${line.item_name}" غير صالحة.`);
      }

      const dbItem = database
        .prepare('SELECT item_id, item_name_en, current_stock, expiry_date FROM items WHERE item_id = ?')
        .get(line.item_id) as {
          item_id: number;
          item_name_en: string;
          current_stock: number;
          expiry_date?: string;
        } | undefined;
      if (!dbItem) {
        throw new Error(`الصنف رقم #${line.item_id} غير موجود.`);
      }
      if (Number(dbItem.current_stock || 0) + 0.0001 < qty) {
        throw new Error(
          `رصيد المخزن للصنف "${dbItem.item_name_en}" (${dbItem.current_stock}) غير كافٍ لإرجاع ${qty}.`
        );
      }

      const lineTotal = roundMoney(qty * cost);
      totalCostValue = roundMoney(totalCostValue + lineTotal);

      return {
        item_id: line.item_id,
        item_name: line.item_name || dbItem.item_name_en,
        quantity: qty,
        unit_cost: cost,
        line_total: lineTotal,
        expiry_date: line.expiry_date || dbItem.expiry_date || ''
      };
    });

    const creditAmount = roundMoney(totalCostValue * (compPct / 100));
    const expiryLossAmount = roundMoney(totalCostValue - creditAmount);
    const cashierId = payload.user_id && payload.user_id > 0 ? payload.user_id : 99;
    const cashierName = (payload.cashier_name || '').trim() || 'د. مريم الحميلي';

    const retInsert = database.prepare(`
      INSERT INTO purchase_returns (
        supplier_id, supplier_name, original_purchase_id, return_type, settlement_mode,
        total_cost_value, credit_amount, expiry_loss_amount, user_id, cashier_name, notes, return_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      supplier.supplier_id,
      supplier.supplier_name,
      payload.original_purchase_id || 0,
      payload.return_type,
      payload.settlement_mode,
      totalCostValue,
      creditAmount,
      expiryLossAmount,
      cashierId,
      cashierName,
      (payload.notes || '').trim(),
      timestamp
    );

    const returnId = Number(retInsert.lastInsertRowid);

    const insertLineStmt = database.prepare(`
      INSERT INTO purchase_return_items (return_id, item_id, item_name, quantity, unit_cost, line_total, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const deductStockStmt = database.prepare(`
      UPDATE items SET current_stock = ROUND(current_stock - ?, 4) WHERE item_id = ?
    `);

    for (const line of preparedLines) {
      insertLineStmt.run(
        returnId,
        line.item_id,
        line.item_name,
        line.quantity,
        line.unit_cost,
        line.line_total,
        line.expiry_date
      );
      deductStockStmt.run(line.quantity, line.item_id);
    }

    if (payload.settlement_mode === 'CASH_REFUND' && creditAmount > 0) {
      database.prepare(`
        UPDATE treasury_state SET cash_balance = ROUND(cash_balance + ?, 2), last_updated = ? WHERE id = 1
      `).run(creditAmount, timestamp);
    }

    const maxTxId = (
      database.prepare('SELECT COALESCE(MAX(id), 0) as m FROM supplier_transactions').get() as { m: number }
    ).m + 1;
    const txType = payload.return_type === 'EXPIRY_RETURN' ? 'مرتجع اكسباير' : 'مرتجع مشتريات';
    database.prepare(`
      INSERT INTO supplier_transactions (id, supplier_id, supplier_name, transaction_type, amount, transaction_date, invoice_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      maxTxId,
      supplier.supplier_id,
      supplier.supplier_name,
      txType,
      payload.settlement_mode === 'SUPPLIER_CREDIT' ? -creditAmount : 0,
      timestamp,
      returnId,
      payload.notes || `${txType} (${compPct}%)`
    );

    const glLines: GlPostingLine[] = [
      {
        account_name: 'اصول.متداولة.مخزون',
        notes: `${txType} #${returnId} - ${supplier.supplier_name}`,
        debit: 0,
        credit: totalCostValue
      }
    ];

    if (creditAmount > 0) {
      glLines.push({
        account_name: payload.settlement_mode === 'CASH_REFUND'
          ? 'اصول.متداولة.نقدية.كاش'
          : 'خصوم.متداولة.موردين',
        notes: payload.settlement_mode === 'CASH_REFUND'
          ? `استرداد نقدي عن ${txType} #${returnId} - ${supplier.supplier_name}`
          : `خصم حساب المورد عن ${txType} #${returnId} - ${supplier.supplier_name}`,
        debit: creditAmount,
        credit: 0
      });
    }

    if (expiryLossAmount > 0) {
      glLines.push({
        account_name: 'مصروفات.تشغيلية.هوالك واكسباير',
        notes: `فارق تعويض إكسباير غير مسترد عن #${returnId} - ${supplier.supplier_name}`,
        debit: expiryLossAmount,
        credit: 0
      });
    }

    postBalancedGlLines(database, date, `PUR-RET-${returnId}`, glLines);

    return {
      return_id: returnId,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      original_purchase_id: payload.original_purchase_id || 0,
      return_type: payload.return_type,
      settlement_mode: payload.settlement_mode,
      total_cost_value: totalCostValue,
      credit_amount: creditAmount,
      expiry_loss_amount: expiryLossAmount,
      user_id: cashierId,
      cashier_name: cashierName,
      notes: (payload.notes || '').trim(),
      return_date: timestamp,
      items_count: preparedLines.length
    };
  });

  return tx();
}

export function getPurchaseReturns(supplierId?: number, limit: number = 50): PurchaseReturnRecord[] {
  const database = getDatabaseInstance();
  const whereClause = supplierId && supplierId > 0 ? 'WHERE pr.supplier_id = ?' : '';
  const params: (number | string)[] = supplierId && supplierId > 0 ? [supplierId, limit] : [limit];

  return database.prepare(`
    SELECT pr.*,
      (SELECT COUNT(*) FROM purchase_return_items pri WHERE pri.return_id = pr.return_id) as items_count
    FROM purchase_returns pr
    ${whereClause}
    ORDER BY pr.return_id DESC
    LIMIT ?
  `).all(...params) as PurchaseReturnRecord[];
}

// ============================================================================
// MODULE 3: SAME-DAY UNSAVE & EDIT SALES INVOICE (#N)
// ============================================================================

function getSalePaymentGlAccount(paymentMethod?: string | null): string {
  if (paymentMethod === 'نقدي' || paymentMethod === 'دليفري') {
    return 'اصول.متداولة.نقدية.كاش';
  }
  if (paymentMethod === 'آجل') {
    return 'اصول.متداولة.عملاء';
  }
  return 'اصول.متداولة.بنك.فيزا';
}

function adjustCustomerBalanceInTx(
  database: Database.Database,
  clientNameRaw: string,
  deltaAmount: number,
  txType: 'SALE' | 'REVERSAL',
  notes: string,
  invoiceNumber: number,
  timestamp: string,
  phone: string = '',
  address: string = ''
): void {
  const clientName = clientNameRaw.trim();
  if (!clientName || deltaAmount === 0) return;

  const cust = database
    .prepare('SELECT customer_id, account_balance FROM customers WHERE customer_name = ?')
    .get(clientName) as { customer_id: number; account_balance: number } | undefined;

  if (!cust) {
    if (deltaAmount > 0) {
      const maxCust = database.prepare('SELECT COALESCE(MAX(customer_id), 0) as maxId FROM customers').get() as { maxId: number };
      const newCustId = maxCust.maxId + 1;
      database.prepare(`
        INSERT INTO customers (customer_id, customer_name, phone, address, account_balance)
        VALUES (?, ?, ?, ?, ?)
      `).run(newCustId, clientName, phone, address, roundMoney(deltaAmount));
      database.prepare(`
        INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, notes, invoice_number)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(newCustId, timestamp, txType, roundMoney(deltaAmount), notes, invoiceNumber);
    }
    return;
  }

  database.prepare(`
    UPDATE customers SET account_balance = ROUND(account_balance + ?, 2) WHERE customer_id = ?
  `).run(roundMoney(deltaAmount), cust.customer_id);

  database.prepare(`
    INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, notes, invoice_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cust.customer_id, timestamp, txType, roundMoney(deltaAmount), notes, invoiceNumber);
}

/**
 * Evaluate whether a sales invoice is eligible for same-day reopen/edit.
 */
export function checkCanEditSaleInvoice(
  invoiceNumber: number,
  currentUserId: number,
  currentUserRole: UserRole
): InvoiceEditEligibility {
  const database = getDatabaseInstance();
  const invoice = database
    .prepare('SELECT * FROM sales_invoices WHERE invoice_number = ?')
    .get(invoiceNumber) as SalesInvoice | undefined;

  if (!invoice) {
    return { can_edit: false, reason: `الفاتورة رقم #${invoiceNumber} غير موجودة.` };
  }

  if (Number(invoice.is_locked || 0) === 1) {
    return { can_edit: false, reason: 'الفاتورة مقفلة ولا يمكن تعديلها بعد إغلاق نهاية اليوم.' };
  }

  const today = getLocalDateTime().date;
  if (invoice.invoice_date !== today) {
    return { can_edit: false, reason: 'يُسمح بفك الحفظ وتعديل الفاتورة في نفس اليوم فقط.' };
  }

  const returnCountRow = database
    .prepare('SELECT COUNT(*) as c FROM sales_returns WHERE invoice_number = ?')
    .get(invoiceNumber) as { c: number };
  if (returnCountRow.c > 0) {
    return { can_edit: false, reason: 'لا يمكن تعديل فاتورة تم عمل مرتجع عليها مسبقاً.' };
  }

  const oldNetTotal = roundMoney((invoice.total_selling_price || 0) - (invoice.discount || 0));
  if (invoice.payment_method === 'نقدي' || invoice.payment_method === 'دليفري') {
    const treasury = database.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number } | undefined;
    const currentCash = roundMoney(treasury?.cash_balance ?? 0);
    if (currentCash + 0.001 < oldNetTotal) {
      return {
        can_edit: false,
        reason: 'لا توجد نقدية كافية في الخزينة لتغطية قيمة الفاتورة المراد تعديلها.'
      };
    }
  }

  const ownerId = Number(invoice.user_id || 99);
  const requiresOverride = currentUserRole !== 'ADMIN' && ownerId !== currentUserId;

  return {
    can_edit: true,
    requires_manager_override: requiresOverride,
    invoice
  };
}

/**
 * Load full invoice + enriched cart lines for POS editing mode.
 */
export function getSaleInvoiceForEdit(invoiceNumber: number): EditableSaleInvoiceData | null {
  const database = getDatabaseInstance();
  const invoice = database
    .prepare('SELECT * FROM sales_invoices WHERE invoice_number = ?')
    .get(invoiceNumber) as SalesInvoice | undefined;
  if (!invoice) return null;

  const rows = database.prepare(`
    SELECT si.*,
      i.item_name_ar,
      i.generic_name,
      COALESCE(i.package_units, 1) as db_package_units,
      COALESCE(i.current_stock, 0) as db_current_stock,
      COALESCE(i.consumer_price, si.unit_price) as db_consumer_price,
      COALESCE(i.temp_price, 0) as db_temp_price,
      COALESCE(i.temp_price_active, 0) as db_temp_price_active,
      COALESCE(i.buy_price, 0) as db_buy_price,
      COALESCE(i.discount_pct, 0) as db_discount_pct,
      COALESCE(i.pharmacy_discount_percent, 0) as db_pharm_disc,
      i.tax_schedule_category
    FROM sales_invoice_items si
    LEFT JOIN items i ON si.item_id = i.item_id
    WHERE si.invoice_number = ?
    ORDER BY si.line_number ASC
  `).all(invoiceNumber) as Array<{
    item_id: number;
    item_name: string;
    quantity: number;
    unit_price: number;
    discount_pct: number;
    line_total: number;
    unit_type?: string;
    cost_price?: number;
    applied_price_source?: string;
    item_name_ar?: string;
    generic_name?: string;
    db_package_units: number;
    db_current_stock: number;
    db_consumer_price: number;
    db_temp_price: number;
    db_temp_price_active: number;
    db_buy_price: number;
    db_discount_pct: number;
    db_pharm_disc: number;
    tax_schedule_category?: number | null;
  }>;

  const items: EditableSaleInvoiceLine[] = rows.map((r) => {
    const unitType: 'pack' | 'unit' = r.unit_type === 'شريط' ? 'unit' : 'pack';
    const pkg = r.db_package_units > 1 ? r.db_package_units : 1;
    const baseConsumer = r.db_consumer_price || r.unit_price;
    const disc = r.db_discount_pct > 0 ? r.db_discount_pct : (r.db_pharm_disc > 0 ? r.db_pharm_disc : 25);
    const effectivePackBuy =
      !r.db_buy_price || r.db_buy_price <= 0 || r.db_buy_price < baseConsumer * 0.35
        ? roundMoney(baseConsumer * (1 - disc / 100))
        : r.db_buy_price;

    return {
      item_id: r.item_id,
      item_name: r.item_name,
      item_name_ar: r.item_name_ar,
      generic_name: r.generic_name,
      quantity: r.quantity,
      unit_type: unitType,
      package_units: pkg,
      unit_price: r.unit_price,
      cost_price: r.cost_price ?? (unitType === 'unit' ? roundMoney(effectivePackBuy / pkg) : effectivePackBuy),
      discount_pct: r.discount_pct || 0,
      line_total: r.line_total,
      tax_schedule_category: r.tax_schedule_category,
      current_stock: r.db_current_stock + (unitType === 'unit' ? Math.round((r.quantity / pkg) * 10000) / 10000 : r.quantity),
      base_consumer_price: baseConsumer,
      base_buy_price: effectivePackBuy,
      applied_price_source: r.applied_price_source === 'TEMP_PRICE' ? 'TEMP_PRICE' : 'CONSUMER',
      temp_price: r.db_temp_price || 0,
      temp_price_active: r.db_temp_price_active || 0
    };
  });

  return { invoice, items };
}

/**
 * Reopen & re-save an existing same-day sales invoice in-place keeping the exact #invoice_number.
 */
export function updateSavedSaleInvoice(payload: UpdateSaleInvoicePayload): CreateSaleInvoiceResult {
  const database = getDatabaseInstance();

  if (!payload.items || payload.items.length === 0) {
    throw new Error('لا يمكن حفظ فاتورة بدون أصناف.');
  }
  for (const item of payload.items) {
    if (!item.item_id || item.item_id <= 0) throw new Error('معرف الصنف غير صالح.');
    if (!item.quantity || item.quantity <= 0 || isNaN(item.quantity)) {
      throw new Error('كمية الصنف يجب أن تكون أكبر من الصفر.');
    }
  }
  if (payload.payment_method === 'آجل' && (!payload.client_name || !payload.client_name.trim())) {
    throw new Error('يجب تحديد اسم العميل للمبيعات الآجلة.');
  }

  const tx = database.transaction(() => {
    const eligibility = checkCanEditSaleInvoice(
      payload.invoice_number,
      payload.editor_user_id,
      payload.editor_role
    );
    if (!eligibility.can_edit || !eligibility.invoice) {
      throw new Error(eligibility.reason || 'الفاتورة غير قابلة للتعديل.');
    }

    let authorizedByName = '';
    if (eligibility.requires_manager_override) {
      const override = verifyManagerOverride(
        payload.manager_override_pin || '',
        payload.editor_user_id,
        'تعديل فاتورة نفس اليوم',
        `INV-${payload.invoice_number}`
      );
      authorizedByName = override.managerName;
    }

    const oldInvoice = eligibility.invoice;
    const invoiceNumber = oldInvoice.invoice_number;
    const local = getLocalDateTime();
    const invoiceDate = local.date;
    const invoiceTime = local.time;
    const fullTimestamp = local.timestamp;

    const oldItems = database.prepare(`
      SELECT * FROM sales_invoice_items WHERE invoice_number = ? ORDER BY line_number ASC
    `).all(invoiceNumber) as Array<{
      id: number;
      item_id: number;
      item_name: string;
      quantity: number;
      unit_price: number;
      discount_pct: number;
      line_total: number;
      unit_type?: string;
      cost_price?: number;
    }>;

    const oldSnapshotJson = JSON.stringify({
      payment_method: oldInvoice.payment_method,
      discount: oldInvoice.discount || 0,
      total_selling_price: oldInvoice.total_selling_price,
      items: oldItems
    });

    // 1. Restore stock for old lines
    const getPkgStmt = database.prepare('SELECT package_units FROM items WHERE item_id = ?');
    const restoreStockStmt = database.prepare('UPDATE items SET current_stock = ROUND(current_stock + ?, 4) WHERE item_id = ?');
    for (const oldLine of oldItems) {
      let restoreQty = oldLine.quantity;
      if (oldLine.unit_type === 'شريط') {
        const pkgRow = getPkgStmt.get(oldLine.item_id) as { package_units?: number } | undefined;
        const pkg = pkgRow?.package_units && pkgRow.package_units > 1 ? pkgRow.package_units : 1;
        restoreQty = Math.round((oldLine.quantity / pkg) * 10000) / 10000;
      }
      restoreStockStmt.run(restoreQty, oldLine.item_id);
    }

    // 2. Reverse old financial effect
    const oldNetTotal = roundMoney((oldInvoice.total_selling_price || 0) - (oldInvoice.discount || 0));
    if (oldInvoice.payment_method === 'نقدي' || oldInvoice.payment_method === 'دليفري') {
      const treasuryRow = database.prepare('SELECT cash_balance FROM treasury_state WHERE id = 1').get() as { cash_balance: number };
      const curCash = roundMoney(treasuryRow?.cash_balance ?? 0);
      if (curCash + 0.001 < oldNetTotal) {
        throw new Error('لا توجد نقدية كافية في الخزينة لتغطية قيمة الفاتورة المراد تعديلها.');
      }
      database.prepare(`
        UPDATE treasury_state SET cash_balance = ROUND(cash_balance - ?, 2), last_updated = ? WHERE id = 1
      `).run(oldNetTotal, fullTimestamp);
    } else if (oldInvoice.payment_method === 'آجل' && oldInvoice.client_name) {
      adjustCustomerBalanceInTx(
        database,
        oldInvoice.client_name,
        -oldNetTotal,
        'REVERSAL',
        `عكس أثر تعديل الفاتورة #${invoiceNumber}`,
        invoiceNumber,
        fullTimestamp
      );
    }

    const revNumRow = database
      .prepare('SELECT COALESCE(MAX(revision_number), 0) as m FROM invoice_revisions_log WHERE invoice_id = ?')
      .get(invoiceNumber) as { m: number };
    const nextRevNum = revNumRow.m + 1;

    // 3. Post explicit GL reversal for old invoice amounts
    if (oldNetTotal > 0) {
      const oldDebitAcc = getSalePaymentGlAccount(oldInvoice.payment_method);
      postBalancedGlLines(database, invoiceDate, `INV-${invoiceNumber}-REV-${nextRevNum}`, [
        {
          account_name: 'ايرادات.مبيعات',
          notes: `عكس مبيعات تعديل فاتورة #${invoiceNumber} (مراجعة ${nextRevNum})`,
          debit: oldNetTotal,
          credit: 0
        },
        {
          account_name: oldDebitAcc,
          notes: `عكس تحصيل تعديل فاتورة #${invoiceNumber} (مراجعة ${nextRevNum})`,
          debit: 0,
          credit: oldNetTotal
        }
      ]);
    }

    // 4. Compute new line pricing, temp prices, and role/below-cost guards
    const resolved = resolveAuthoritativeSaleLinesAndPricing(database, payload, {
      requesterId: payload.editor_user_id,
      requesterRole: payload.editor_role,
      targetRef: `INV-${invoiceNumber}`,
      skipOverrideAuditIfAlreadyVerified: eligibility.requires_manager_override
    });
    const {
      totalSellingPrice,
      totalCostPrice,
      discount,
      netTotal,
      profit,
      discountMode,
      discountInputValue,
      overrideManagerName
    } = resolved;
    authorizedByName = authorizedByName || overrideManagerName;

    const paid = payload.paid_amount !== undefined && payload.paid_amount !== null ? payload.paid_amount : netTotal;
    if ((payload.payment_method === 'نقدي' || payload.payment_method === 'دليفري') && paid + 0.001 < netTotal) {
      throw new Error(`المبلغ المدفوع (${paid} ج.م) أقل من إجمالي الفاتورة المطلوبة (${netTotal} ج.م).`);
    }
    const change = Math.max(0, roundMoney(paid - netTotal));

    // 5. Update same invoice row #N & replace line items
    database.prepare(`
      UPDATE sales_invoices
      SET item_count = ?,
          total_selling_price = ?,
          total_cost_price = ?,
          profit = ?,
          discount = ?,
          discount_mode = ?,
          discount_input_value = ?,
          override_manager_name = ?,
          payment_method = ?,
          client_name = ?,
          client_phone = ?,
          client_address = ?,
          notes = ?,
          edit_count = COALESCE(edit_count, 0) + 1,
          last_edited_at = ?,
          last_edited_by = ?
      WHERE invoice_number = ?
    `).run(
      payload.items.length,
      totalSellingPrice,
      totalCostPrice,
      profit,
      discount,
      discountMode,
      discountInputValue,
      overrideManagerName,
      payload.payment_method,
      payload.client_name || '',
      payload.client_phone || '',
      payload.client_address || '',
      payload.notes || '',
      fullTimestamp,
      payload.editor_user_name,
      invoiceNumber
    );

    database.prepare('DELETE FROM sales_invoice_items WHERE invoice_number = ?').run(invoiceNumber);

    const maxItemRow = database.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM sales_invoice_items').get() as { maxId: number };
    let currentItemId = maxItemRow.maxId;
    const maxShortageRow = database.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM shortages_drafts').get() as { maxId: number };
    let currentShortageId = maxShortageRow.maxId;

    const insertItemStmt = database.prepare(`
      INSERT INTO sales_invoice_items (
        id, invoice_number, line_number, item_id, item_name, quantity, unit_price, discount_pct, line_total, invoice_date, invoice_time, unit_type, cost_price, applied_price_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const deductStockStmt = database.prepare('UPDATE items SET current_stock = ROUND(current_stock - ?, 4), last_sold_at = ? WHERE item_id = ?');
    const checkShortageStmt = database.prepare('SELECT count(*) as count FROM shortages_drafts WHERE item_id = ?');
    const insertShortageStmt = database.prepare(`
      INSERT INTO shortages_drafts (id, supplier_id, supplier_name, item_id, item_name, quantity, order_code)
      VALUES (?, 1, 'الشراء من غير الموردين', ?, ?, 1, '')
    `);

    let lineNumber = 1;
    for (const item of payload.items) {
      currentItemId++;
      insertItemStmt.run(
        currentItemId,
        invoiceNumber,
        lineNumber++,
        item.item_id,
        item.item_name,
        item.quantity,
        item.unit_price,
        item.discount_pct || 0,
        item.line_total,
        invoiceDate,
        fullTimestamp,
        item.unit_type === 'unit' ? 'شريط' : 'عبوة',
        item.cost_price || 0,
        item.applied_price_source || 'CONSUMER'
      );

      let deductQty = item.quantity;
      if (item.unit_type === 'unit') {
        const pkg = item.package_units && item.package_units > 1 ? item.package_units : 1;
        deductQty = Math.round((item.quantity / pkg) * 10000) / 10000;
      }
      deductStockStmt.run(deductQty, invoiceDate, item.item_id);

      const curStockRow = database.prepare('SELECT current_stock, item_name_en FROM items WHERE item_id = ?').get(item.item_id) as { current_stock: number; item_name_en: string } | undefined;
      if (curStockRow && curStockRow.current_stock <= 0) {
        const existing = checkShortageStmt.get(item.item_id) as { count: number };
        if (existing.count === 0) {
          currentShortageId++;
          insertShortageStmt.run(currentShortageId, item.item_id, curStockRow.item_name_en);
        }
      }
    }

    // 6. Apply new payment method balances & GL
    if (payload.payment_method === 'نقدي' || payload.payment_method === 'دليفري') {
      database.prepare(`
        UPDATE treasury_state SET cash_balance = ROUND(cash_balance + ?, 2), last_updated = ? WHERE id = 1
      `).run(netTotal, fullTimestamp);
    } else if (payload.payment_method === 'آجل' && payload.client_name) {
      adjustCustomerBalanceInTx(
        database,
        payload.client_name,
        netTotal,
        'SALE',
        `فاتورة مبيعات آجل معدلة #${invoiceNumber}`,
        invoiceNumber,
        fullTimestamp,
        payload.client_phone || '',
        payload.client_address || ''
      );
    }

    if (netTotal > 0) {
      const newDebitAcc = getSalePaymentGlAccount(payload.payment_method);
      postBalancedGlLines(database, invoiceDate, `INV-${invoiceNumber}-EDIT-${nextRevNum}`, [
        {
          account_name: newDebitAcc,
          notes: `مبيعات ${payload.payment_method} فاتورة معدلة #${invoiceNumber}`,
          debit: netTotal,
          credit: 0
        },
        {
          account_name: 'ايرادات.مبيعات',
          notes: `إيراد مبيعات فاتورة معدلة #${invoiceNumber}`,
          debit: 0,
          credit: netTotal
        }
      ]);
    }

    // 7. Save full revision audit entry
    const newSnapshotJson = JSON.stringify({
      payment_method: payload.payment_method,
      discount,
      total_selling_price: totalSellingPrice,
      items: payload.items
    });

    database.prepare(`
      INSERT INTO invoice_revisions_log (
        invoice_id, revision_number, edited_by_user_id, edited_by_user_name, authorized_by_name,
        old_total, new_total, old_payment_method, new_payment_method,
        old_snapshot_json, new_snapshot_json, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNumber,
      nextRevNum,
      payload.editor_user_id,
      payload.editor_user_name,
      authorizedByName,
      oldNetTotal,
      netTotal,
      oldInvoice.payment_method || 'نقدي',
      payload.payment_method,
      oldSnapshotJson,
      newSnapshotJson,
      payload.reason || 'تعديل فاتورة نفس اليوم',
      fullTimestamp
    );

    return {
      success: true,
      invoice_number: invoiceNumber,
      invoice_date: oldInvoice.invoice_date,
      invoice_time: invoiceTime,
      total_selling_price: totalSellingPrice,
      total_cost_price: totalCostPrice,
      profit,
      discount,
      payment_method: payload.payment_method,
      item_count: payload.items.length,
      change,
      items: payload.items,
      client_name: payload.client_name,
      client_phone: payload.client_phone,
      client_address: payload.client_address
    };
  });

  return tx();
}

export function getInvoiceRevisions(invoiceNumber: number): InvoiceRevisionEntry[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT * FROM invoice_revisions_log
    WHERE invoice_id = ?
    ORDER BY revision_number DESC
  `).all(invoiceNumber) as InvoiceRevisionEntry[];
}

// ============================================================================
// MODULE 5: MULTI-BARCODE MANAGEMENT & INTERNAL BARCODE GENERATION
// ============================================================================

export function getItemBarcodes(itemId: number): ItemBarcodeEntry[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT * FROM item_barcodes
    WHERE item_id = ?
    ORDER BY is_primary DESC, id ASC
  `).all(itemId) as ItemBarcodeEntry[];
}

export function addItemBarcode(itemId: number, barcode: string, label: string = 'باركود إضافي'): ItemBarcodeEntry {
  const database = getDatabaseInstance();
  const cleanCode = normalizeArabicDigits(String(barcode || '')).trim();
  if (!cleanCode) {
    throw new Error('يرجى إدخال قيمة الباركود.');
  }
  const item = database.prepare('SELECT item_id FROM items WHERE item_id = ?').get(itemId);
  if (!item) {
    throw new Error(`الصنف رقم #${itemId} غير موجود.`);
  }

  const existingOwner = database
    .prepare('SELECT item_id FROM item_barcodes WHERE barcode = ? LIMIT 1')
    .get(cleanCode) as { item_id: number } | undefined;
  if (existingOwner) {
    if (existingOwner.item_id === itemId) {
      return database
        .prepare('SELECT * FROM item_barcodes WHERE barcode = ? LIMIT 1')
        .get(cleanCode) as ItemBarcodeEntry;
    }
    throw new Error(`الباركود "${cleanCode}" مسجل بالفعل لصنف آخر (#${existingOwner.item_id}).`);
  }

  const { timestamp } = getLocalDateTime();
  const res = database.prepare(`
    INSERT INTO item_barcodes (item_id, barcode, label, is_primary, created_at)
    VALUES (?, ?, ?, 0, ?)
  `).run(itemId, cleanCode, label.trim() || 'باركود إضافي', timestamp);

  return database.prepare('SELECT * FROM item_barcodes WHERE id = ?').get(Number(res.lastInsertRowid)) as ItemBarcodeEntry;
}

export function removeItemBarcode(id: number): { success: boolean } {
  const database = getDatabaseInstance();
  const row = database.prepare('SELECT is_primary FROM item_barcodes WHERE id = ?').get(id) as { is_primary: number } | undefined;
  if (!row) {
    return { success: false };
  }
  if (row.is_primary === 1) {
    throw new Error('لا يمكن حذف الباركود الأساسي من هنا؛ يمكنك تعديله من بطاقة الصنف.');
  }
  database.prepare('DELETE FROM item_barcodes WHERE id = ?').run(id);
  return { success: true };
}

export function ensureItemHasBarcode(itemId: number): string {
  const database = getDatabaseInstance();
  const item = database
    .prepare('SELECT item_id, barcode FROM items WHERE item_id = ?')
    .get(itemId) as { item_id: number; barcode?: string | null } | undefined;
  if (!item) {
    throw new Error(`الصنف رقم #${itemId} غير موجود.`);
  }

  const existing = String(item.barcode || '').trim();
  if (existing) {
    return existing;
  }

  const generated = `98${String(itemId).padStart(10, '0')}`;
  const { timestamp } = getLocalDateTime();
  const tx = database.transaction(() => {
    database.prepare('UPDATE items SET barcode = ? WHERE item_id = ?').run(generated, itemId);
    database.prepare(`
      INSERT OR IGNORE INTO item_barcodes (item_id, barcode, label, is_primary, created_at)
      VALUES (?, ?, 'باركود داخلي مولّد', 1, ?)
    `).run(itemId, generated, timestamp);
  });
  tx();

  return generated;
}

/**
 * Module 7: Bulk auto-match imported purchase invoice rows against catalog (Barcode -> ID -> Name)
 * and persist supplier Excel column mapping preferences.
 */
export function matchImportedPurchaseRows(
  rows: ImportedPurchaseRowInput[],
  supplierId?: number,
  columnMapJson?: string
): MatchedImportPurchaseRow[] {
  const database = getDatabaseInstance();

  if (supplierId && supplierId > 0 && columnMapJson !== undefined) {
    database
      .prepare('UPDATE suppliers SET excel_column_map_json = ? WHERE supplier_id = ?')
      .run(columnMapJson, supplierId);
  }

  const byItemIdStmt = database.prepare('SELECT * FROM items WHERE item_id = ? LIMIT 1');
  const byExactNameStmt = database.prepare('SELECT * FROM items WHERE UPPER(TRIM(item_name_en)) = UPPER(?) LIMIT 1');
  const byArNameStmt = database.prepare('SELECT * FROM items WHERE TRIM(item_name_ar) = ? LIMIT 1');
  const byPrefixNameStmt = database.prepare(`
    SELECT * FROM items
    WHERE UPPER(TRIM(item_name_en)) LIKE UPPER(?)
    ORDER BY (CASE WHEN current_stock > 0 THEN 0 ELSE 1 END), LENGTH(item_name_en) ASC
    LIMIT 1
  `);

  return (rows || []).map((row) => {
    let matchedItem: Item | null = null;
    let matchStatus: MatchedImportPurchaseRow['matchStatus'] = 'UNMATCHED';

    // 1. Barcode Match (primary items.barcode + secondary item_barcodes)
    if (row.barcode && row.barcode.trim()) {
      const candidates = extractBarcodeCandidates(row.barcode.trim());
      if (candidates.length > 0) {
        const placeholders = candidates.map(() => '?').join(', ');
        const direct = database
          .prepare(`SELECT * FROM items WHERE TRIM(COALESCE(barcode, '')) IN (${placeholders}) LIMIT 1`)
          .get(...candidates) as Item | undefined;
        if (direct) {
          matchedItem = direct;
          matchStatus = 'BARCODE';
        } else {
          const secondary = database
            .prepare(`
              SELECT i.* FROM item_barcodes ib
              JOIN items i ON ib.item_id = i.item_id
              WHERE TRIM(ib.barcode) IN (${placeholders})
              LIMIT 1
            `)
            .get(...candidates) as Item | undefined;
          if (secondary) {
            matchedItem = secondary;
            matchStatus = 'BARCODE';
          }
        }
      }
    }

    // 2. Direct Item ID Match
    if (!matchedItem && row.itemId && Number(row.itemId) > 0) {
      const idHit = byItemIdStmt.get(Number(row.itemId)) as Item | undefined;
      if (idHit) {
        matchedItem = idHit;
        matchStatus = 'ID';
      }
    }

    // 3. Name Match (Exact English/Arabic -> Prefix -> Phonetic)
    if (!matchedItem && row.itemName && row.itemName.trim()) {
      const cleanName = row.itemName.trim();
      const exactHit =
        (byExactNameStmt.get(cleanName) as Item | undefined) ||
        (byArNameStmt.get(cleanName) as Item | undefined) ||
        (byPrefixNameStmt.get(`${cleanName}%`) as Item | undefined);

      if (exactHit) {
        matchedItem = exactHit;
        matchStatus = 'NAME';
      } else {
        const pKey = computePhoneticKey(cleanName);
        if (pKey && pKey.length >= 3) {
          const pTokens = pKey.split(' ').filter(Boolean);
          const clauses = pTokens.map(() => "COALESCE(phonetic_key, '') LIKE ?");
          const pHit = database
            .prepare(`
              SELECT * FROM items
              WHERE ${clauses.join(' AND ')}
              ORDER BY (CASE WHEN current_stock > 0 THEN 0 ELSE 1 END), LENGTH(item_name_en) ASC
              LIMIT 1
            `)
            .get(...pTokens.map(t => `%${t}%`)) as Item | undefined;
          if (pHit) {
            matchedItem = pHit;
            matchStatus = 'NAME';
          }
        }
      }
    }

    const resolvedQuantity = Math.max(0.01, Number(row.quantity) || 1);
    const resolvedBonus = Math.max(0, Number(row.bonusQuantity) || 0);
    const resolvedConsumerPrice =
      Number(row.consumerPrice) > 0
        ? Number(row.consumerPrice)
        : Number(matchedItem?.consumer_price || 0);
    const resolvedDiscountPct =
      row.discountPct !== undefined && Number(row.discountPct) >= 0
        ? Number(row.discountPct)
        : Number(matchedItem?.discount_pct || 0);

    let resolvedBuyPrice = Number(row.buyPrice || 0);
    if (resolvedBuyPrice <= 0) {
      if (resolvedConsumerPrice > 0 && resolvedDiscountPct > 0) {
        resolvedBuyPrice = Math.round(resolvedConsumerPrice * (1 - resolvedDiscountPct / 100) * 100) / 100;
      } else {
        resolvedBuyPrice = Number(matchedItem?.buy_price || 0);
      }
    }

    const resolvedLineTotal = Math.round(resolvedQuantity * resolvedBuyPrice * 100) / 100;
    const resolvedExpiryDate = String(row.expiryDate || matchedItem?.expiry_date || '').trim();

    return {
      rowIndex: row.rowIndex,
      input: row,
      matchStatus,
      matchedItem,
      resolvedQuantity,
      resolvedBonus,
      resolvedConsumerPrice,
      resolvedDiscountPct,
      resolvedBuyPrice,
      resolvedLineTotal,
      resolvedExpiryDate
    };
  });
}

// =========================================================================
// MODULE 8: Smart Shortages, Sales Velocity & Best Historical Supplier
// =========================================================================

function getLocalDateOffset(daysDelta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysDelta);
  return getLocalDateTime(d).date;
}

function getEffectiveOfferMetrics(raw: {
  purchase_invoice_id: number;
  supplier_id: number;
  supplier_name: string;
  invoice_date: string;
  quantity: number;
  bonus_quantity: number;
  discount_pct: number;
  buy_price: number;
  line_total: number;
  consumer_price: number;
}): SupplierPurchaseHistoryOffer {
  const qty = Number(raw.quantity || 0);
  const bonus = Math.max(0, Number(raw.bonus_quantity || 0));
  const totalUnits = qty + bonus;
  const netCost =
    totalUnits > 0 && Number(raw.line_total || 0) > 0
      ? Math.round((Number(raw.line_total) / totalUnits) * 100) / 100
      : Number(raw.buy_price || 0);

  let effectiveDiscount = Number(raw.discount_pct || 0);
  if (effectiveDiscount <= 0 && Number(raw.consumer_price || 0) > 0 && netCost > 0) {
    effectiveDiscount = Math.round(((raw.consumer_price - netCost) / raw.consumer_price) * 1000) / 10;
  }

  return {
    purchase_invoice_id: raw.purchase_invoice_id,
    supplier_id: raw.supplier_id,
    supplier_name: raw.supplier_name,
    invoice_date: raw.invoice_date,
    quantity: qty,
    bonus_quantity: bonus,
    discount_pct: Math.max(0, effectiveDiscount),
    net_unit_cost: netCost,
    consumer_price: Number(raw.consumer_price || 0)
  };
}

function pickBestOffer(offers: SupplierPurchaseHistoryOffer[]): SupplierPurchaseHistoryOffer | null {
  if (offers.length === 0) return null;
  const sorted = [...offers].sort((a, b) => {
    if (Math.abs(b.discount_pct - a.discount_pct) > 0.05) {
      return b.discount_pct - a.discount_pct;
    }
    if (Math.abs(a.net_unit_cost - b.net_unit_cost) > 0.01) {
      return a.net_unit_cost - b.net_unit_cost;
    }
    return b.invoice_date.localeCompare(a.invoice_date);
  });
  return sorted[0];
}

export function getItemVelocityAndBestSupplier(itemId: number): ItemVelocityAndBestSupplierReport {
  const database = getDatabaseInstance();
  const item = database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId) as Item | undefined;
  if (!item) {
    throw new Error(`الصنف رقم #${itemId} غير موجود.`);
  }

  const date30Ago = getLocalDateOffset(-30);
  const date90Ago = getLocalDateOffset(-90);
  const pkg = Math.max(1, Number(item.package_units || 1));

  const salesAgg = database
    .prepare(`
      SELECT
        COALESCE(SUM(CASE
          WHEN invoice_date >= ? THEN
            (CASE WHEN COALESCE(unit_type, 'عبوة') = 'شريط' AND ? > 1 THEN quantity * 1.0 / ? ELSE quantity END)
          ELSE 0 END), 0) as sold_30d,
        COALESCE(SUM(CASE
          WHEN invoice_date >= ? THEN
            (CASE WHEN COALESCE(unit_type, 'عبوة') = 'شريط' AND ? > 1 THEN quantity * 1.0 / ? ELSE quantity END)
          ELSE 0 END), 0) as sold_90d
      FROM sales_invoice_items
      WHERE item_id = ? AND invoice_date >= ?
    `)
    .get(date30Ago, pkg, pkg, date90Ago, pkg, pkg, itemId, date90Ago) as { sold_30d: number; sold_90d: number };

  const sold30 = Math.round(Number(salesAgg.sold_30d || 0) * 100) / 100;
  const sold90 = Math.round(Number(salesAgg.sold_90d || 0) * 100) / 100;
  const dailyVelocity = Math.round((sold30 / 30) * 1000) / 1000;
  const monthlyVelocity = Math.round(sold30 * 100) / 100;
  const currentStock = Number(item.current_stock || 0);
  const minStock = Number(item.min_stock || 0);
  const maxStock = Number(item.max_stock || 0);
  const daysRemaining = dailyVelocity > 0 ? Math.round((currentStock / dailyVelocity) * 10) / 10 : null;

  const targetLevel = maxStock > 0 ? maxStock : Math.max(minStock * 2, Math.ceil(monthlyVelocity));
  const suggestedQty = Math.max(1, Math.ceil(Math.max(0, targetLevel - currentStock)));

  const rawOffers = database
    .prepare(`
      SELECT
        pii.purchase_invoice_id,
        pi.supplier_id,
        pi.supplier_name,
        pi.invoice_date,
        pii.quantity,
        COALESCE(pii.bonus_quantity, 0) as bonus_quantity,
        COALESCE(pii.discount_pct, 0) as discount_pct,
        COALESCE(pii.buy_price, 0) as buy_price,
        COALESCE(pii.line_total, 0) as line_total,
        COALESCE(pii.consumer_price, 0) as consumer_price
      FROM purchase_invoice_items pii
      JOIN purchases_invoices pi ON pii.purchase_invoice_id = pi.purchase_invoice_id
      WHERE pii.item_id = ?
      ORDER BY pi.invoice_date DESC, pii.purchase_invoice_id DESC
      LIMIT 10
    `)
    .all(itemId) as Array<{
    purchase_invoice_id: number;
    supplier_id: number;
    supplier_name: string;
    invoice_date: string;
    quantity: number;
    bonus_quantity: number;
    discount_pct: number;
    buy_price: number;
    line_total: number;
    consumer_price: number;
  }>;

  const recentPurchases = rawOffers.map(getEffectiveOfferMetrics);
  const bestSupplier = pickBestOffer(recentPurchases);

  return {
    item_id: item.item_id,
    item_name_en: item.item_name_en,
    current_stock: currentStock,
    min_stock: minStock,
    max_stock: maxStock,
    sold_last_30d: sold30,
    sold_last_90d: sold90,
    daily_velocity: dailyVelocity,
    monthly_velocity: monthlyVelocity,
    days_remaining: daysRemaining,
    suggested_order_qty: suggestedQty,
    best_supplier: bestSupplier,
    recent_purchases: recentPurchases.slice(0, 5)
  };
}

export function getSmartShortages(filter: SmartShortageFilter = {}): SmartShortageItem[] {
  const database = getDatabaseInstance();
  const daysLookback = Math.max(7, Math.min(180, Number(filter.daysLookback || 30)));
  const dateCutoff30 = getLocalDateOffset(-30);
  const dateCutoff90 = getLocalDateOffset(-90);
  const dateCutoffLookback = getLocalDateOffset(-daysLookback);
  const limit = Math.min(500, Math.max(10, Number(filter.limit || 200)));
  const search = String(filter.searchQuery || '').trim();
  const searchLike = `%${search}%`;

  // Gather candidate item IDs from manual drafts, min_stock alerts, and active velocity movers
  const candidateRows = database
    .prepare(`
      WITH drafts_agg AS (
        SELECT
          item_id,
          MAX(id) as draft_id,
          MAX(quantity) as draft_qty,
          MAX(supplier_id) as draft_supplier_id,
          MAX(supplier_name) as draft_supplier_name
        FROM shortages_drafts
        GROUP BY item_id
      ),
      sales_win AS (
        SELECT
          si.item_id,
          COALESCE(SUM(CASE WHEN si.invoice_date >= ? THEN
            (CASE WHEN COALESCE(si.unit_type, 'عبوة') = 'شريط' AND COALESCE(i.package_units, 1) > 1
              THEN si.quantity * 1.0 / i.package_units ELSE si.quantity END)
            ELSE 0 END), 0) as sold_30d,
          COALESCE(SUM(CASE WHEN si.invoice_date >= ? THEN
            (CASE WHEN COALESCE(si.unit_type, 'عبوة') = 'شريط' AND COALESCE(i.package_units, 1) > 1
              THEN si.quantity * 1.0 / i.package_units ELSE si.quantity END)
            ELSE 0 END), 0) as sold_90d,
          COALESCE(SUM(CASE WHEN si.invoice_date >= ? THEN
            (CASE WHEN COALESCE(si.unit_type, 'عبوة') = 'شريط' AND COALESCE(i.package_units, 1) > 1
              THEN si.quantity * 1.0 / i.package_units ELSE si.quantity END)
            ELSE 0 END), 0) as sold_lookback
        FROM sales_invoice_items si
        JOIN items i ON si.item_id = i.item_id
        WHERE si.invoice_date >= ?
        GROUP BY si.item_id
      )
      SELECT
        i.*,
        COALESCE(sw.sold_30d, 0) as sold_30d,
        COALESCE(sw.sold_90d, 0) as sold_90d,
        COALESCE(sw.sold_lookback, 0) as sold_lookback,
        sd.draft_id as draft_id,
        sd.draft_qty as draft_qty,
        sd.draft_supplier_id as draft_supplier_id,
        sd.draft_supplier_name as draft_supplier_name
      FROM items i
      LEFT JOIN sales_win sw ON sw.item_id = i.item_id
      LEFT JOIN drafts_agg sd ON sd.item_id = i.item_id
      WHERE (
        sd.draft_id IS NOT NULL
        OR (COALESCE(i.min_stock, 0) > 0 AND i.current_stock <= i.min_stock AND COALESCE(i.auto_reorder, 1) = 1)
        OR (COALESCE(sw.sold_lookback, 0) > 0 AND (i.current_stock <= 0 OR (i.current_stock / (sw.sold_lookback * 1.0 / ?)) < 7))
      )
      ${filter.onlyCritical ? 'AND (i.current_stock <= 0 OR (COALESCE(i.min_stock, 0) > 0 AND i.current_stock <= i.min_stock) OR (COALESCE(sw.sold_lookback, 0) > 0 AND (i.current_stock / (sw.sold_lookback * 1.0 / ?)) < 5))' : ''}
      ${filter.supplierId && filter.supplierId > 0 ? 'AND (sd.draft_supplier_id = ? OR EXISTS (SELECT 1 FROM purchase_invoice_items pii JOIN purchases_invoices pi ON pii.purchase_invoice_id = pi.purchase_invoice_id WHERE pii.item_id = i.item_id AND pi.supplier_id = ?))' : ''}
      ${search ? 'AND (i.item_name_en LIKE ? OR COALESCE(i.item_name_ar, \'\') LIKE ? OR COALESCE(i.generic_name, \'\') LIKE ? OR COALESCE(i.barcode, \'\') LIKE ?)' : ''}
      ORDER BY
        CASE
          WHEN COALESCE(i.min_stock, 0) > 0 AND i.current_stock <= i.min_stock THEN 0
          WHEN COALESCE(sw.sold_lookback, 0) > 0 AND i.current_stock <= 0 THEN 1
          WHEN COALESCE(sw.sold_lookback, 0) > 0 THEN 2
          WHEN i.current_stock <= 0 THEN 3
          ELSE 4
        END ASC,
        COALESCE(sw.sold_30d, 0) DESC,
        i.item_id ASC
      LIMIT ?
    `)
    .all(
      dateCutoff30,
      dateCutoff90,
      dateCutoffLookback,
      dateCutoff90,
      daysLookback,
      ...(filter.onlyCritical ? [daysLookback] : []),
      ...(filter.supplierId && filter.supplierId > 0 ? [filter.supplierId, filter.supplierId] : []),
      ...(search ? [searchLike, searchLike, searchLike, searchLike] : []),
      Math.max(limit * 3, 600)
    ) as Array<Item & {
      sold_30d: number;
      sold_90d: number;
      sold_lookback: number;
      draft_id: number | null;
      draft_qty: number | null;
      draft_supplier_id: number | null;
      draft_supplier_name: string | null;
    }>;

  const purchaseOfferStmt = database.prepare(`
    SELECT
      pii.purchase_invoice_id,
      pi.supplier_id,
      pi.supplier_name,
      pi.invoice_date,
      pii.quantity,
      COALESCE(pii.bonus_quantity, 0) as bonus_quantity,
      COALESCE(pii.discount_pct, 0) as discount_pct,
      COALESCE(pii.buy_price, 0) as buy_price,
      COALESCE(pii.line_total, 0) as line_total,
      COALESCE(pii.consumer_price, 0) as consumer_price
    FROM purchase_invoice_items pii
    JOIN purchases_invoices pi ON pii.purchase_invoice_id = pi.purchase_invoice_id
    WHERE pii.item_id = ?
    ORDER BY pi.invoice_date DESC, pii.purchase_invoice_id DESC
    LIMIT 8
  `);

  const mapped: SmartShortageItem[] = [];
  for (const row of candidateRows) {
    const sold30 = Math.round(Number(row.sold_30d || 0) * 100) / 100;
    const sold90 = Math.round(Number(row.sold_90d || 0) * 100) / 100;
    const dailyVelocity = Math.round((sold30 / 30) * 1000) / 1000;
    const monthlyVelocity = sold30;
    const currentStock = Number(row.current_stock || 0);
    const minStock = Number(row.min_stock || 0);
    const maxStock = Number(row.max_stock || 0);
    const daysOfCover = dailyVelocity > 0 ? Math.round((currentStock / dailyVelocity) * 10) / 10 : null;

    let urgency: SmartShortageItem['urgency'] = 'DRAFT';
    if (currentStock <= 0) urgency = 'OUT_OF_STOCK';
    else if (daysOfCover !== null && daysOfCover < 5) urgency = 'LOW_COVER';
    else if (minStock > 0 && currentStock <= minStock) urgency = 'BELOW_MIN';

    if (filter.onlyCritical && urgency === 'DRAFT') {
      continue;
    }

    const rawOffers = purchaseOfferStmt.all(row.item_id) as Array<{
      purchase_invoice_id: number;
      supplier_id: number;
      supplier_name: string;
      invoice_date: string;
      quantity: number;
      bonus_quantity: number;
      discount_pct: number;
      buy_price: number;
      line_total: number;
      consumer_price: number;
    }>;
    const best = pickBestOffer(rawOffers.map(getEffectiveOfferMetrics));
    const chosenSupplierId = best?.supplier_id ?? row.draft_supplier_id ?? null;
    if (filter.supplierId && filter.supplierId > 0 && chosenSupplierId !== filter.supplierId) {
      continue;
    }

    const targetLevel = maxStock > 0 ? maxStock : Math.max(minStock * 2, Math.ceil(monthlyVelocity));
    const calcQty = Math.max(1, Math.ceil(Math.max(0, targetLevel - currentStock)));
    const suggestedQty = row.draft_qty && row.draft_qty > calcQty ? row.draft_qty : calcQty;

    mapped.push({
      item_id: row.item_id,
      item_name_en: row.item_name_en,
      item_name_ar: row.item_name_ar,
      generic_name: row.generic_name || undefined,
      producer: row.producer || undefined,
      barcode: row.barcode || undefined,
      current_stock: currentStock,
      min_stock: minStock,
      max_stock: maxStock,
      consumer_price: Number(row.consumer_price || 0),
      buy_price: Number(row.buy_price || 0),
      discount_pct: Number(row.discount_pct || 0),
      package_units: Math.max(1, Number(row.package_units || 1)),
      sold_last_30d: sold30,
      sold_last_90d: sold90,
      daily_velocity: dailyVelocity,
      monthly_velocity: monthlyVelocity,
      days_of_cover: daysOfCover,
      suggested_order_qty: suggestedQty,
      urgency,
      in_manual_draft: row.draft_id !== null,
      best_supplier_id: chosenSupplierId,
      best_supplier_name: best?.supplier_name ?? row.draft_supplier_name ?? 'غير محدد',
      best_discount_pct: best?.discount_pct,
      best_net_cost: best?.net_unit_cost,
      last_purchase_date: best?.invoice_date
    });
  }

  const getSmartPriorityTier = (it: SmartShortageItem): number => {
    if (it.urgency === 'OUT_OF_STOCK' && (it.min_stock > 0 || it.sold_last_30d > 0)) return 0;
    if (it.urgency === 'LOW_COVER') return 1;
    if (it.urgency === 'BELOW_MIN') return 2;
    if (it.urgency === 'OUT_OF_STOCK') return 3;
    return 4;
  };
  mapped.sort((a, b) => {
    const rankDiff = getSmartPriorityTier(a) - getSmartPriorityTier(b);
    if (rankDiff !== 0) return rankDiff;
    return b.sold_last_30d - a.sold_last_30d;
  });

  return mapped.slice(0, limit);
}

export function updateItemStockThresholds(
  itemId: number,
  minStock: number,
  maxStock: number,
  autoReorder: number = 1
): Item {
  const database = getDatabaseInstance();
  const minVal = Math.max(0, Number(minStock) || 0);
  const maxVal = Math.max(minVal, Number(maxStock) || 0);
  const autoVal = autoReorder ? 1 : 0;

  const info = database
    .prepare('UPDATE items SET min_stock = ?, max_stock = ?, auto_reorder = ? WHERE item_id = ?')
    .run(minVal, maxVal, autoVal, itemId);
  if (info.changes === 0) {
    throw new Error(`الصنف رقم #${itemId} غير موجود.`);
  }
  return database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId) as Item;
}

export function autoSuggestMinMaxFromSales(days: number = 60): { updatedCount: number } {
  const database = getDatabaseInstance();
  const lookback = Math.max(14, Math.min(365, Number(days || 60)));
  const cutoff = getLocalDateOffset(-lookback);

  const rows = database
    .prepare(`
      SELECT
        si.item_id,
        SUM(CASE WHEN COALESCE(si.unit_type, 'عبوة') = 'شريط' AND COALESCE(i.package_units, 1) > 1
          THEN si.quantity * 1.0 / i.package_units ELSE si.quantity END) as total_sold
      FROM sales_invoice_items si
      JOIN items i ON si.item_id = i.item_id
      WHERE si.invoice_date >= ?
      GROUP BY si.item_id
      HAVING total_sold > 0
    `)
    .all(cutoff) as Array<{ item_id: number; total_sold: number }>;

  const updateStmt = database.prepare(`
    UPDATE items SET min_stock = ?, max_stock = ?, auto_reorder = 1 WHERE item_id = ?
  `);

  const tx = database.transaction(() => {
    let updatedCount = 0;
    for (const r of rows) {
      const dailyAvg = r.total_sold / lookback;
      const minStock = Math.max(1, Math.ceil(dailyAvg * 7));
      const maxStock = Math.max(minStock * 2, Math.ceil(dailyAvg * 30));
      updateStmt.run(minStock, maxStock, r.item_id);
      updatedCount++;
    }
    return { updatedCount };
  });

  return tx();
}

// =========================================================================
// MODULE 9: Shelf Stocktake, Velocity Expiry Risk, Duplicate Merge & Integrity
// =========================================================================

export function updateItemShelfLocation(itemId: number, shelfLocation: string): Item {
  const database = getDatabaseInstance();
  const cleanShelf = String(shelfLocation || '').trim();
  const info = database
    .prepare('UPDATE items SET shelf_location = ? WHERE item_id = ?')
    .run(cleanShelf, itemId);
  if (info.changes === 0) {
    throw new Error(`الصنف رقم #${itemId} غير موجود.`);
  }
  return database.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId) as Item;
}

export function getShelfItemsForStocktake(shelfFilter: string = '', limit: number = 150): Item[] {
  const database = getDatabaseInstance();
  const clean = shelfFilter.trim();
  const safeLimit = Math.min(300, Math.max(10, Number(limit || 150)));
  if (clean) {
    return database
      .prepare(`
        SELECT * FROM items
        WHERE COALESCE(shelf_location, '') LIKE ?
        ORDER BY shelf_location ASC, item_name_en ASC
        LIMIT ?
      `)
      .all(`%${clean}%`, safeLimit) as Item[];
  }
  return database
    .prepare(`
      SELECT * FROM items
      WHERE current_stock > 0 OR TRIM(COALESCE(shelf_location, '')) != ''
      ORDER BY (CASE WHEN TRIM(COALESCE(shelf_location, '')) != '' THEN 0 ELSE 1 END),
        shelf_location ASC, item_name_en ASC
      LIMIT ?
    `)
    .all(safeLimit) as Item[];
}

export function getStocktakeSessions(limit: number = 30): StocktakeSessionRecord[] {
  const database = getDatabaseInstance();
  return database
    .prepare('SELECT * FROM stocktake_sessions ORDER BY session_id DESC LIMIT ?')
    .all(limit) as StocktakeSessionRecord[];
}

export function createAndPostStocktakeSession(payload: PostStocktakeSessionPayload): PostStocktakeSessionResult {
  const database = getDatabaseInstance();
  if (!payload.lines || payload.lines.length === 0) {
    throw new Error('يجب إدخال صنف واحد على الأقل لاعتماد جلسة الجرد.');
  }

  const scopeLabel = String(payload.scopeLabel || '').trim() || 'جرد سريع بالدولاب';
  const { date, timestamp } = getLocalDateTime();

  const tx = database.transaction(() => {
    const insertSession = database.prepare(`
      INSERT INTO stocktake_sessions (scope_label, status, user_id, user_name, total_variance_cost, created_at, posted_at)
      VALUES (?, 'POSTED', ?, ?, 0, ?, ?)
    `);
    const sessInfo = insertSession.run(
      scopeLabel,
      payload.userId || 99,
      payload.userName || 'د. مريم الحميلي',
      timestamp,
      timestamp
    );
    const sessionId = Number(sessInfo.lastInsertRowid);

    const insertLine = database.prepare(`
      INSERT INTO stocktake_lines (session_id, item_id, system_qty, counted_qty, variance_qty, unit_cost, variance_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStock = database.prepare('UPDATE items SET current_stock = ? WHERE item_id = ?');

    let totalVarianceQty = 0;
    let totalVarianceCost = 0;

    for (const line of payload.lines) {
      const item = database.prepare('SELECT * FROM items WHERE item_id = ?').get(line.itemId) as Item | undefined;
      if (!item) {
        throw new Error(`الصنف رقم #${line.itemId} غير موجود.`);
      }
      const countedQty = Math.max(0, Math.round(Number(line.countedQty) * 10000) / 10000);
      const systemQty = Number(item.current_stock || 0);
      const varianceQty = Math.round((countedQty - systemQty) * 10000) / 10000;
      const unitCost =
        item.buy_price && item.buy_price > 0
          ? Number(item.buy_price)
          : Math.round(Number(item.consumer_price || 0) * 0.75 * 100) / 100;
      const varianceCost = Math.round(varianceQty * unitCost * 100) / 100;

      insertLine.run(sessionId, item.item_id, systemQty, countedQty, varianceQty, unitCost, varianceCost);
      updateStock.run(countedQty, item.item_id);

      totalVarianceQty = Math.round((totalVarianceQty + varianceQty) * 10000) / 10000;
      totalVarianceCost = roundMoney(totalVarianceCost + varianceCost);
    }

    database
      .prepare('UPDATE stocktake_sessions SET total_variance_cost = ? WHERE session_id = ?')
      .run(totalVarianceCost, sessionId);

    let glAccount = '— (جرد مطابق 100%)';
    if (Math.abs(totalVarianceCost) >= 0.01) {
      const absCost = Math.abs(totalVarianceCost);
      const docRef = `STK-${sessionId}`;
      if (totalVarianceCost < 0) {
        glAccount = 'مصروفات.تشغيلية.عجز وتسويات جرد';
        postBalancedGlLines(database, date, docRef, [
          {
            account_name: glAccount,
            notes: `عجز جرد (${scopeLabel}) بواسطة ${payload.userName}`,
            debit: absCost,
            credit: 0
          },
          {
            account_name: 'اصول.متداولة.مخزون',
            notes: `تسوية عجز مخزون (${scopeLabel})`,
            debit: 0,
            credit: absCost
          }
        ]);
      } else {
        glAccount = 'ايرادات.تسويات وجرد زيادة';
        postBalancedGlLines(database, date, docRef, [
          {
            account_name: 'اصول.متداولة.مخزون',
            notes: `تسوية زيادة جرد (${scopeLabel}) بواسطة ${payload.userName}`,
            debit: absCost,
            credit: 0
          },
          {
            account_name: glAccount,
            notes: `إيراد زيادة مخزون (${scopeLabel})`,
            debit: 0,
            credit: absCost
          }
        ]);
      }
    }

    return {
      session_id: sessionId,
      scope_label: scopeLabel,
      lines_count: payload.lines.length,
      total_variance_qty: totalVarianceQty,
      total_variance_cost: totalVarianceCost,
      gl_account: glAccount,
      posted_at: timestamp
    };
  });

  return tx();
}

function parseExpiryDateStr(raw: string): Date | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  const mmyyyy = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (mmyyyy) {
    const month = parseInt(mmyyyy[1], 10);
    const year = parseInt(mmyyyy[2], 10);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
      return new Date(year, month, 0, 23, 59, 59);
    }
  }

  const ymd = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10);
    const day = ymd[3] ? parseInt(ymd[3], 10) : 28;
    if (month >= 1 && month <= 12) {
      return new Date(year, month - 1, day, 23, 59, 59);
    }
  }

  return null;
}

export function getExpiryRiskReport(monthsAhead: number = 6): ExpiryRiskItem[] {
  const database = getDatabaseInstance();
  const horizonDays = Math.max(30, Math.min(730, Math.round(monthsAhead * 30.5)));
  const dateCutoff30 = getLocalDateOffset(-30);
  const now = new Date();
  const msPerDay = 86400000;

  const stockedWithExpiry = database
    .prepare(`
      WITH sales_30 AS (
        SELECT
          si.item_id,
          SUM(CASE WHEN COALESCE(si.unit_type, 'عبوة') = 'شريط' AND COALESCE(i.package_units, 1) > 1
            THEN si.quantity * 1.0 / i.package_units ELSE si.quantity END) as qty_30d
        FROM sales_invoice_items si
        JOIN items i ON si.item_id = i.item_id
        WHERE si.invoice_date >= ?
        GROUP BY si.item_id
      )
      SELECT i.*, COALESCE(s.qty_30d, 0) as qty_30d
      FROM items i
      LEFT JOIN sales_30 s ON s.item_id = i.item_id
      WHERE i.current_stock > 0 AND TRIM(COALESCE(i.expiry_date, '')) != ''
    `)
    .all(dateCutoff30) as Array<Item & { qty_30d: number }>;

  const risks: ExpiryRiskItem[] = [];
  for (const row of stockedWithExpiry) {
    const expDate = parseExpiryDateStr(row.expiry_date || '');
    if (!expDate) continue;

    const daysToExpiry = Math.ceil((expDate.getTime() - now.getTime()) / msPerDay);
    if (daysToExpiry > horizonDays || daysToExpiry < -365) continue;

    const dailyVelocity = Math.round((Number(row.qty_30d || 0) / 30) * 1000) / 1000;
    const expectedSold =
      daysToExpiry > 0 ? Math.round(dailyVelocity * daysToExpiry * 100) / 100 : 0;
    const atRiskQty = Math.max(0, Math.round((row.current_stock - expectedSold) * 100) / 100);
    if (atRiskQty <= 0) continue;

    const unitCost =
      row.buy_price && row.buy_price > 0
        ? Number(row.buy_price)
        : Math.round(Number(row.consumer_price || 0) * 0.75 * 100) / 100;
    const atRiskCostEgp = Math.round(atRiskQty * unitCost * 100) / 100;

    risks.push({
      item_id: row.item_id,
      item_name_en: row.item_name_en,
      item_name_ar: row.item_name_ar,
      shelf_location: row.shelf_location || '',
      expiry_date: String(row.expiry_date || ''),
      current_stock: Number(row.current_stock),
      buy_price: unitCost,
      consumer_price: Number(row.consumer_price || 0),
      days_to_expiry: daysToExpiry,
      daily_velocity: dailyVelocity,
      expected_sold_before_expiry: expectedSold,
      at_risk_qty: atRiskQty,
      at_risk_cost_egp: atRiskCostEgp
    });
  }

  risks.sort((a, b) => b.at_risk_cost_egp - a.at_risk_cost_egp);
  return risks;
}

export function findDuplicateItemCandidates(limit: number = 60): DuplicateCandidatePair[] {
  const database = getDatabaseInstance();
  const rows = database
    .prepare(`
      SELECT
        a.item_id as primary_item_id,
        a.item_name_en as primary_name,
        a.current_stock as primary_stock,
        a.barcode as primary_barcode,
        b.item_id as duplicate_item_id,
        b.item_name_en as duplicate_name,
        b.current_stock as duplicate_stock,
        b.barcode as duplicate_barcode
      FROM items a
      JOIN items b
        ON a.item_id < b.item_id
       AND UPPER(TRIM(a.item_name_en)) = UPPER(TRIM(b.item_name_en))
       AND TRIM(a.item_name_en) != ''
      LIMIT ?
    `)
    .all(limit) as Array<{
    primary_item_id: number;
    primary_name: string;
    primary_stock: number;
    primary_barcode?: string;
    duplicate_item_id: number;
    duplicate_name: string;
    duplicate_stock: number;
    duplicate_barcode?: string;
  }>;

  return rows.map(r => {
    if (r.duplicate_stock > r.primary_stock) {
      return {
        primary_item_id: r.duplicate_item_id,
        primary_name: r.duplicate_name,
        primary_stock: r.duplicate_stock,
        primary_barcode: r.duplicate_barcode,
        duplicate_item_id: r.primary_item_id,
        duplicate_name: r.primary_name,
        duplicate_stock: r.primary_stock,
        duplicate_barcode: r.primary_barcode,
        match_reason: 'SAME_NAME' as const
      };
    }
    return { ...r, match_reason: 'SAME_NAME' as const };
  });
}

export function mergeDuplicateItems(
  primaryItemId: number,
  duplicateItemId: number,
  managerName: string
): MergeItemsResult {
  const database = getDatabaseInstance();
  if (primaryItemId === duplicateItemId) {
    throw new Error('لا يمكن دمج الصنف مع نفسه.');
  }
  const cleanManager = String(managerName || '').trim();
  if (!cleanManager) {
    throw new Error('اسم المدير المسؤول عن الدمج مطلوب.');
  }

  const { timestamp } = getLocalDateTime();

  const tx = database.transaction(() => {
    const primary = database.prepare('SELECT * FROM items WHERE item_id = ?').get(primaryItemId) as Item | undefined;
    const duplicate = database.prepare('SELECT * FROM items WHERE item_id = ?').get(duplicateItemId) as Item | undefined;
    if (!primary) throw new Error(`الصنف الأساسي #${primaryItemId} غير موجود.`);
    if (!duplicate) throw new Error(`الصنف المكرر #${duplicateItemId} غير موجود.`);

    const movedStock = Number(duplicate.current_stock || 0);
    const mergedStock = Math.round((Number(primary.current_stock || 0) + movedStock) * 10000) / 10000;

    database.prepare('UPDATE items SET current_stock = ? WHERE item_id = ?').run(mergedStock, primaryItemId);

    const salesRes = database
      .prepare('UPDATE sales_invoice_items SET item_id = ? WHERE item_id = ?')
      .run(primaryItemId, duplicateItemId);
    const purRes = database
      .prepare('UPDATE purchase_invoice_items SET item_id = ? WHERE item_id = ?')
      .run(primaryItemId, duplicateItemId);
    database
      .prepare('UPDATE purchase_return_items SET item_id = ? WHERE item_id = ?')
      .run(primaryItemId, duplicateItemId);
    database
      .prepare('UPDATE stocktake_lines SET item_id = ? WHERE item_id = ?')
      .run(primaryItemId, duplicateItemId);

    const dupBarcodes = database
      .prepare('SELECT barcode, label FROM item_barcodes WHERE item_id = ?')
      .all(duplicateItemId) as Array<{ barcode: string; label: string }>;
    if (duplicate.barcode && duplicate.barcode.trim()) {
      dupBarcodes.push({ barcode: duplicate.barcode.trim(), label: `باركود مدمج من #${duplicateItemId}` });
    }
    let barcodesMoved = 0;
    const insertBarcodeStmt = database.prepare(`
      INSERT OR IGNORE INTO item_barcodes (item_id, barcode, label, is_primary, created_at)
      VALUES (?, ?, ?, 0, ?)
    `);
    database.prepare('DELETE FROM item_barcodes WHERE item_id = ?').run(duplicateItemId);
    for (const b of dupBarcodes) {
      const code = String(b.barcode || '').trim();
      if (!code) continue;
      const info = insertBarcodeStmt.run(primaryItemId, code, b.label || 'باركود مدمج', timestamp);
      barcodesMoved += info.changes;
    }

    const primaryHasShortage = database.prepare('SELECT id FROM shortages_drafts WHERE item_id = ?').get(primaryItemId);
    if (primaryHasShortage) {
      database.prepare('DELETE FROM shortages_drafts WHERE item_id = ?').run(duplicateItemId);
    } else {
      database.prepare('UPDATE shortages_drafts SET item_id = ? WHERE item_id = ?').run(primaryItemId, duplicateItemId);
    }

    database.prepare(`
      INSERT INTO item_merge_log (primary_item_id, duplicate_item_id, duplicate_item_name, moved_stock, merged_by, merged_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(primaryItemId, duplicateItemId, duplicate.item_name_en, movedStock, cleanManager, timestamp);

    try {
      database.prepare('DELETE FROM items_fts WHERE item_id = ?').run(duplicateItemId);
    } catch {
      // ignore FTS cleanup errors
    }
    database.prepare('DELETE FROM items WHERE item_id = ?').run(duplicateItemId);

    return {
      primary_item_id: primaryItemId,
      duplicate_item_id: duplicateItemId,
      duplicate_item_name: duplicate.item_name_en,
      moved_stock: movedStock,
      sales_lines_moved: salesRes.changes,
      purchase_lines_moved: purRes.changes,
      barcodes_moved: barcodesMoved,
      merged_at: timestamp
    };
  });

  return tx();
}

export function runStockAndLedgerIntegrityAudit(): StockAndLedgerAuditReport {
  const database = getDatabaseInstance();
  const costRow = database
    .prepare(`
      SELECT COALESCE(ROUND(SUM(
        current_stock * (CASE WHEN COALESCE(buy_price, 0) > 0 THEN buy_price ELSE COALESCE(consumer_price, 0) * 0.75 END)
      ), 2), 0) as total_cost
      FROM items WHERE current_stock > 0
    `)
    .get() as { total_cost: number };

  const glRow = database
    .prepare(`
      SELECT COALESCE(ROUND(SUM(debit - credit), 2), 0) as gl_bal
      FROM general_ledger_2026
      WHERE account_name LIKE 'اصول.متداولة.مخزون%'
    `)
    .get() as { gl_bal: number };

  const negativeRows = database
    .prepare('SELECT item_id, item_name_en, current_stock FROM items WHERE current_stock < 0 ORDER BY current_stock ASC LIMIT 50')
    .all() as Array<{ item_id: number; item_name_en: string; current_stock: number }>;

  const belowCostRows = database
    .prepare(`
      SELECT item_id, item_name_en, COALESCE(buy_price, 0) as buy_price, COALESCE(consumer_price, 0) as consumer_price
      FROM items
      WHERE current_stock > 0 AND consumer_price > 0 AND buy_price > consumer_price
      LIMIT 50
    `)
    .all() as Array<{ item_id: number; item_name_en: string; buy_price: number; consumer_price: number }>;

  const inventoryItemsCostTotal = Number(costRow.total_cost || 0);
  const glInventoryBalance = Number(glRow.gl_bal || 0);

  return {
    inventory_items_cost_total: inventoryItemsCostTotal,
    gl_inventory_balance: glInventoryBalance,
    inventory_gl_diff: roundMoney(inventoryItemsCostTotal - glInventoryBalance),
    negative_stock_items: negativeRows,
    below_cost_items: belowCostRows,
    gl_integrity: checkLedgerIntegrity()
  };
}

// =========================================================================
// MODULE 10: Chronic Patients, Insurance Claims, Generics vs Alternatives & DDI
// =========================================================================

export function getChronicPatients(query: string = ''): ChronicPatient[] {
  const database = getDatabaseInstance();
  const clean = query.trim();
  let rows: any[] = [];
  if (clean) {
    rows = database.prepare(`
      SELECT * FROM chronic_patients 
      WHERE patient_name LIKE ? OR phone LIKE ? OR conditions LIKE ?
      ORDER BY patient_name ASC
    `).all(`%${clean}%`, `%${clean}%`, `%${clean}%`);
  } else {
    rows = database.prepare('SELECT * FROM chronic_patients ORDER BY patient_name ASC').all();
  }

  const getItemsStmt = database.prepare(`
    SELECT cpi.*, i.item_name_en, i.item_name_ar, i.consumer_price, i.current_stock
    FROM chronic_patient_items cpi
    JOIN items i ON cpi.item_id = i.item_id
    WHERE cpi.patient_id = ?
  `);

  return rows.map((p: any) => ({
    patient_id: p.patient_id,
    patient_name: p.patient_name,
    phone: p.phone || '',
    conditions: p.conditions || '',
    refill_interval_days: p.refill_interval_days || 30,
    last_refill_date: p.last_refill_date || '',
    next_due_date: p.next_due_date || '',
    notes: p.notes || '',
    items: getItemsStmt.all(p.patient_id) as ChronicPatientItem[]
  }));
}

export function saveChronicPatient(payload: SaveChronicPatientPayload): ChronicPatient {
  const database = getDatabaseInstance();
  const name = (payload.patient_name || '').trim();
  if (!name) {
    throw new Error('يجب إدخال اسم المريض المزمن.');
  }

  const tx = database.transaction(() => {
    let patientId = payload.patient_id;
    const interval = Math.max(1, Number(payload.refill_interval_days || 30));

    if (patientId && patientId > 0) {
      database.prepare(`
        UPDATE chronic_patients
        SET patient_name = ?, phone = ?, conditions = ?, refill_interval_days = ?,
            last_refill_date = COALESCE(?, last_refill_date),
            next_due_date = COALESCE(?, next_due_date),
            notes = ?
        WHERE patient_id = ?
      `).run(
        name,
        payload.phone || '',
        payload.conditions || '',
        interval,
        payload.last_refill_date || null,
        payload.next_due_date || null,
        payload.notes || '',
        patientId
      );
    } else {
      const nextDue = payload.next_due_date || '';
      const info = database.prepare(`
        INSERT INTO chronic_patients (
          patient_name, phone, conditions, refill_interval_days,
          last_refill_date, next_due_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        name,
        payload.phone || '',
        payload.conditions || '',
        interval,
        payload.last_refill_date || '',
        nextDue,
        payload.notes || ''
      );
      patientId = Number(info.lastInsertRowid);
    }

    if (payload.items) {
      database.prepare('DELETE FROM chronic_patient_items WHERE patient_id = ?').run(patientId);
      const insertItemStmt = database.prepare(`
        INSERT INTO chronic_patient_items (patient_id, item_id, dosage_notes, quantity)
        VALUES (?, ?, ?, ?)
      `);
      for (const item of payload.items) {
        if (item.item_id && item.item_id > 0) {
          insertItemStmt.run(
            patientId,
            item.item_id,
            item.dosage_notes || '',
            Math.max(1, Number(item.quantity || 1))
          );
        }
      }
    }

    return patientId;
  });

  const finalId = tx();
  const list = getChronicPatients();
  const found = list.find((p) => p.patient_id === finalId);
  if (!found) {
    throw new Error('فشل استرجاع بيانات المريض بعد الحفظ.');
  }
  return found;
}

export function deleteChronicPatient(patientId: number): boolean {
  const database = getDatabaseInstance();
  const tx = database.transaction(() => {
    database.prepare('DELETE FROM chronic_patient_items WHERE patient_id = ?').run(patientId);
    const info = database.prepare('DELETE FROM chronic_patients WHERE patient_id = ?').run(patientId);
    return info.changes > 0;
  });
  return tx();
}

export function getInsuranceProviders(): InsuranceProvider[] {
  const database = getDatabaseInstance();
  return database.prepare(`
    SELECT provider_id, provider_name, default_copay_pct, credit_balance, contact_phone, is_active
    FROM insurance_providers
    ORDER BY is_active DESC, provider_name ASC
  `).all() as InsuranceProvider[];
}

export function saveInsuranceProvider(provider: Partial<InsuranceProvider>): InsuranceProvider {
  const database = getDatabaseInstance();
  const name = (provider.provider_name || '').trim();
  if (!name) {
    throw new Error('يجب إدخال اسم شركة التأمين.');
  }
  const copay = Math.max(0, Math.min(100, Number(provider.default_copay_pct ?? 20)));
  const phone = (provider.contact_phone || '').trim();
  const active = provider.is_active !== undefined ? (provider.is_active ? 1 : 0) : 1;

  if (provider.provider_id && provider.provider_id > 0) {
    database.prepare(`
      UPDATE insurance_providers
      SET provider_name = ?, default_copay_pct = ?, contact_phone = ?, is_active = ?
      WHERE provider_id = ?
    `).run(name, copay, phone, active, provider.provider_id);
    return database.prepare('SELECT * FROM insurance_providers WHERE provider_id = ?').get(provider.provider_id) as InsuranceProvider;
  } else {
    const info = database.prepare(`
      INSERT INTO insurance_providers (provider_name, default_copay_pct, credit_balance, contact_phone, is_active)
      VALUES (?, ?, 0, ?, ?)
    `).run(name, copay, phone, active);
    return database.prepare('SELECT * FROM insurance_providers WHERE provider_id = ?').get(info.lastInsertRowid) as InsuranceProvider;
  }
}

export function getInsuranceClaims(providerId?: number, status?: string): InsuranceClaimRecord[] {
  const database = getDatabaseInstance();
  let sql = `
    SELECT c.*, p.provider_name
    FROM insurance_claims c
    JOIN insurance_providers p ON c.provider_id = p.provider_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (providerId && providerId > 0) {
    sql += ' AND c.provider_id = ?';
    params.push(providerId);
  }
  if (status && status !== 'ALL') {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY c.claim_id DESC LIMIT 300';
  return database.prepare(sql).all(...params) as InsuranceClaimRecord[];
}

export function recordInsuranceSettlement(providerId: number, paidAmount: number, notes: string = ''): {
  success: boolean;
  newBalance: number;
  settledAmount: number;
} {
  const database = getDatabaseInstance();
  const amount = Math.round(Number(paidAmount || 0) * 100) / 100;
  if (amount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر.');
  }

  const provider = database.prepare('SELECT * FROM insurance_providers WHERE provider_id = ?').get(providerId) as InsuranceProvider | undefined;
  if (!provider) {
    throw new Error(`شركة التأمين رقم #${providerId} غير موجودة.`);
  }

  const tx = database.transaction(() => {
    const local = getLocalDateTime();
    const cleanNotes = notes.trim() || `سداد مطالبة تأمين - ${provider.provider_name}`;

    postBalancedGlLines(database, local.date, `INS-SETTLE-${providerId}-${Date.now().toString().slice(-6)}`, [
      {
        account_name: 'اصول.متداولة.نقدية.كاش',
        notes: cleanNotes,
        debit: amount,
        credit: 0
      },
      {
        account_name: 'اصول.متداولة.ذمم شركات تامين',
        notes: `تخفيض ذمة ${provider.provider_name}`,
        debit: 0,
        credit: amount
      }
    ]);

    database.prepare(`
      UPDATE treasury_state
      SET cash_balance = ROUND(cash_balance + ?, 2), last_updated = ?
      WHERE id = 1
    `).run(amount, local.timestamp);

    database.prepare(`
      UPDATE insurance_providers
      SET credit_balance = ROUND(MAX(0, credit_balance - ?), 2)
      WHERE provider_id = ?
    `).run(amount, providerId);

    let remainingToSettle = amount;
    const pendingClaims = database.prepare(`
      SELECT claim_id, company_claim_amount FROM insurance_claims
      WHERE provider_id = ? AND status = 'PENDING'
      ORDER BY claim_id ASC
    `).all(providerId) as Array<{ claim_id: number; company_claim_amount: number }>;

    for (const c of pendingClaims) {
      if (remainingToSettle >= c.company_claim_amount) {
        database.prepare("UPDATE insurance_claims SET status = 'PAID', paid_date = ? WHERE claim_id = ?").run(local.date, c.claim_id);
        remainingToSettle = Math.round((remainingToSettle - c.company_claim_amount) * 100) / 100;
      } else {
        break;
      }
    }

    const updated = database.prepare('SELECT credit_balance FROM insurance_providers WHERE provider_id = ?').get(providerId) as { credit_balance: number };
    return {
      success: true,
      newBalance: updated.credit_balance,
      settledAmount: amount
    };
  });

  return tx();
}

export function checkCartInteractions(items: Array<{ item_id: number; generic_name?: string; item_name_en?: string; item_name_ar?: string }>): CartInteractionCheckResult {
  const database = getDatabaseInstance();
  const alerts: DrugInteractionAlert[] = [];

  if (!items || items.length < 2) {
    return { hasAlerts: false, alerts: [] };
  }

  const populated = items.map((it) => {
    let g = (it.generic_name || '').trim().toLowerCase();
    let nameEn = it.item_name_en || '';
    let nameAr = it.item_name_ar || '';
    if (!g || !nameEn) {
      const dbItem = database.prepare('SELECT generic_name, item_name_en, item_name_ar FROM items WHERE item_id = ?').get(it.item_id) as any;
      if (dbItem) {
        if (!g) g = (dbItem.generic_name || '').trim().toLowerCase();
        if (!nameEn) nameEn = dbItem.item_name_en || '';
        if (!nameAr) nameAr = dbItem.item_name_ar || '';
      }
    }
    return {
      item_id: it.item_id,
      displayName: nameAr ? `${nameAr} (${nameEn})` : nameEn || `صنف #${it.item_id}`,
      generic: g
    };
  });

  // 1. Check duplicate generic among distinct item IDs
  const genericMap = new Map<string, typeof populated>();
  for (const item of populated) {
    if (!item.generic || item.generic === 'undefined' || item.generic === 'null') continue;
    const existing = genericMap.get(item.generic) || [];
    if (!existing.some((e) => e.item_id === item.item_id)) {
      existing.push(item);
      genericMap.set(item.generic, existing);
    }
  }

  for (const [gen, matched] of genericMap.entries()) {
    if (matched.length > 1) {
      alerts.push({
        type: 'DUPLICATE_GENERIC',
        severity: 'HIGH',
        itemA: matched[0].displayName,
        itemB: matched[1].displayName,
        genericA: gen,
        genericB: gen,
        clinical_note: `تنبيه سريري: كلا الصنفين يحتويان على نفس المادة الفعالة (${gen}). خطر تضاعف الجرعة العلاجية والتسمم الدوائي.`
      });
    }
  }

  // 2. Check DDI pairs from drug_interactions table
  const allInteractions = database.prepare('SELECT generic_a, generic_b, severity, clinical_note FROM drug_interactions').all() as Array<{
    generic_a: string;
    generic_b: string;
    severity: 'HIGH' | 'MODERATE';
    clinical_note: string;
  }>;

  for (let i = 0; i < populated.length; i++) {
    for (let j = i + 1; j < populated.length; j++) {
      const a = populated[i];
      const b = populated[j];
      if (!a.generic || !b.generic || a.generic === b.generic) continue;

      const matchedDdi = allInteractions.find(
        (rule) =>
          (rule.generic_a.toLowerCase() === a.generic && rule.generic_b.toLowerCase() === b.generic) ||
          (rule.generic_a.toLowerCase() === b.generic && rule.generic_b.toLowerCase() === a.generic)
      );

      if (matchedDdi) {
        alerts.push({
          type: 'DDI',
          severity: matchedDdi.severity,
          itemA: a.displayName,
          itemB: b.displayName,
          genericA: a.generic,
          genericB: b.generic,
          clinical_note: matchedDdi.clinical_note
        });
      }
    }
  }

  return {
    hasAlerts: alerts.length > 0,
    alerts
  };
}

export function getSubstitutesAndAlternatives(itemId: number): SubstitutesAndAlternativesResult {
  const database = getDatabaseInstance();
  const source = database.prepare('SELECT item_id, generic_name, category, consumer_price FROM items WHERE item_id = ?').get(itemId) as Item | undefined;

  if (!source) {
    return {
      sameGeneric: [],
      sameCategory: [],
      sourceGeneric: '',
      sourceCategory: ''
    };
  }

  const gen = (source.generic_name || '').trim();
  const cat = (source.category || '').trim();

  let sameGeneric: Item[] = [];
  if (gen) {
    sameGeneric = database.prepare(`
      SELECT * FROM items
      WHERE generic_name = ? AND item_id != ?
      ORDER BY (CASE WHEN current_stock > 0 THEN 0 ELSE 1 END), consumer_price ASC
      LIMIT 100
    `).all(gen, itemId) as Item[];
  }

  let sameCategory: Item[] = [];
  if (cat) {
    sameCategory = database.prepare(`
      SELECT * FROM items
      WHERE category = ? AND item_id != ? AND (generic_name != ? OR generic_name IS NULL OR generic_name = '')
      ORDER BY (CASE WHEN current_stock > 0 THEN 0 ELSE 1 END), consumer_price ASC
      LIMIT 100
    `).all(cat, itemId, gen) as Item[];
  }

  return {
    sameGeneric,
    sameCategory,
    sourceGeneric: gen,
    sourceCategory: cat
  };
}







