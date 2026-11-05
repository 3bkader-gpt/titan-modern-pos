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
  UserAccount,
  AuditLogs,
  LedgerIntegrityStatus
} from '../shared/types';

let db: Database.Database | null = null;

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

    // Ensure Dr. Mariam Elhomeily account exists in users table
    const existingDoctor = database.prepare("SELECT * FROM users WHERE user_name LIKE '%مريم%' OR user_name LIKE '%الحميلي%'").get();
    if (!existingDoctor) {
      const maxUser = database.prepare('SELECT COALESCE(MAX(user_id), 0) as maxId FROM users').get() as { maxId: number };
      database.prepare(`
        INSERT INTO users (user_id, user_name, is_active, permissions_mask)
        VALUES (?, 'د. مريم الحميلي', 1, 8224)
      `).run(maxUser.maxId + 1);
    }
  } catch {
    // Indexes exist or table locked
  }
}

export function initDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  let targetPath = dbPath;
  if (!targetPath) {
    const candidatePaths = [
      path.resolve(process.cwd(), 'data', 'pharmacy.sqlite'),
      path.resolve(path.dirname(process.execPath), 'data', 'pharmacy.sqlite'),
      path.resolve(process.resourcesPath || '', 'data', 'pharmacy.sqlite'),
      path.resolve(typeof __dirname !== 'undefined' ? __dirname : process.cwd(), '..', 'data', 'pharmacy.sqlite')
    ];
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
export function searchItems(query: string, filterInStockOnly: boolean = false, limit: number = 50): Item[] {
  const database = getDatabaseInstance();
  const trimmed = query.trim();

  // If no query, return top items
  if (!trimmed) {
    const sql = `
      SELECT * FROM items
      ${filterInStockOnly ? 'WHERE current_stock > 0' : ''}
      ORDER BY item_name_en ASC
      LIMIT ?
    `;
    return database.prepare(sql).all(limit) as Item[];
  }

  // 1. Direct barcode exact match check (instant index lookup)
  const barcodeMatch = database.prepare('SELECT * FROM items WHERE barcode = ? LIMIT 1').get(trimmed) as Item | undefined;
  if (barcodeMatch) {
    const list = [barcodeMatch];
    if (filterInStockOnly && barcodeMatch.current_stock <= 0) {
      // still return or filter
    } else {
      return list;
    }
  }

  // 2. Direct Item ID exact match check
  if (/^\d+$/.test(trimmed)) {
    const idMatch = database.prepare('SELECT * FROM items WHERE item_id = ? LIMIT 1').get(parseInt(trimmed, 10)) as Item | undefined;
    if (idMatch && (!filterInStockOnly || idMatch.current_stock > 0)) {
      const rest = searchByFts(trimmed, filterInStockOnly, limit - 1, idMatch.item_id);
      return [idMatch, ...rest];
    }
  }

  // 3. FTS5 prefix search
  return searchByFts(trimmed, filterInStockOnly, limit);
}

function searchByFts(rawQuery: string, filterInStockOnly: boolean, limit: number, excludeId?: number): Item[] {
  const database = getDatabaseInstance();
  const clean = rawQuery.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, ' ').trim();
  if (!clean) {
    return [];
  }

  const terms = clean.split(/\s+/).filter(Boolean);
  const ftsQuery = terms.map(t => `"${t}"*`).join(' AND ');

  try {
    const ftsParams: (string | number)[] = [ftsQuery];
    let ftsExcludeClause = '';
    if (excludeId !== undefined) {
      ftsExcludeClause = 'AND i.item_id != ?';
      ftsParams.push(excludeId);
    }
    ftsParams.push(limit);

    const sql = `
      SELECT i.*
      FROM items_fts f
      JOIN items i ON f.item_id = i.item_id
      WHERE items_fts MATCH ?
      ${filterInStockOnly ? 'AND i.current_stock > 0' : ''}
      ${ftsExcludeClause}
      ORDER BY 
        (CASE WHEN i.current_stock > 0 THEN 0 ELSE 1 END),
        i.item_name_en ASC
      LIMIT ?
    `;
    const ftsResults = database.prepare(sql).all(...ftsParams) as Item[];

    if (ftsResults.length > 0) {
      return ftsResults;
    }
  } catch {
    // If FTS match has syntax quirk, fallback to LIKE
  }

  // Fallback to LIKE if FTS produced 0 results
  const likeParams: (string | number)[] = [pattern, pattern, pattern, pattern];
  let likeExcludeClause = '';
  if (excludeId !== undefined) {
    likeExcludeClause = 'AND item_id != ?';
    likeParams.push(excludeId);
  }
  likeParams.push(limit);

  const likeSql = `
    SELECT * FROM items
    WHERE (
      item_name_en LIKE ? OR 
      item_name_ar LIKE ? OR 
      generic_name LIKE ? OR 
      barcode LIKE ?
    )
    ${filterInStockOnly ? 'AND current_stock > 0' : ''}
    ${likeExcludeClause}
    ORDER BY (CASE WHEN current_stock > 0 THEN 0 ELSE 1 END), item_name_en ASC
    LIMIT ?
  `;
  return database.prepare(likeSql).all(...likeParams) as Item[];
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

    // Statement to query item pricing & discount metadata
    const getItemPricingStmt = database.prepare(`
      SELECT item_id, item_name_en, item_name_ar, consumer_price, buy_price, discount_pct, pharmacy_discount_percent, package_units
      FROM items WHERE item_id = ?
    `);

    // 2. Compute Totals with Authoritative Server Pricing & Effective Cost Price
    let totalSellingPrice = 0;
    let totalCostPrice = 0;

    for (const item of payload.items) {
      const itemDb = getItemPricingStmt.get(item.item_id) as {
        item_id: number;
        item_name_en: string;
        item_name_ar: string;
        consumer_price: number;
        buy_price: number;
        discount_pct: number;
        pharmacy_discount_percent: number;
        package_units: number;
      } | undefined;

      if (!itemDb) {
        throw new Error(`الصنف رقم #${item.item_id} غير موجود في قاعدة البيانات.`);
      }

      const pkgUnits = (itemDb.package_units && itemDb.package_units > 1) ? itemDb.package_units : 1;
      item.package_units = pkgUnits;

      // Authoritative consumer price from DB
      let authoritativeUnitPrice = itemDb.consumer_price;
      if (item.unit_type === 'unit') {
        authoritativeUnitPrice = Math.round((itemDb.consumer_price / pkgUnits) * 100) / 100;
      }
      item.unit_price = authoritativeUnitPrice;

      // Clamp discount percentage to [0, 100]
      const discPct = Math.min(100, Math.max(0, Number(item.discount_pct || 0)));
      item.discount_pct = discPct;

      // Authoritative line total calculated server-side
      const authoritativeLineTotal = Math.round(item.quantity * authoritativeUnitPrice * (1 - (discPct / 100)) * 100) / 100;
      item.line_total = authoritativeLineTotal;
      totalSellingPrice += authoritativeLineTotal;

      let effectiveCost = item.cost_price;
      const cp = itemDb.consumer_price || authoritativeUnitPrice;
      const bp = itemDb.buy_price || 0;
      const disc = (itemDb.discount_pct && itemDb.discount_pct > 0)
        ? itemDb.discount_pct
        : ((itemDb.pharmacy_discount_percent && itemDb.pharmacy_discount_percent > 0) ? itemDb.pharmacy_discount_percent : 25);

      const effectivePackCost = (bp <= 0 || bp < (cp * 0.35))
        ? Math.round(cp * (1.0 - (disc / 100.0)) * 100) / 100
        : bp;

      if (item.unit_type === 'unit' && pkgUnits > 1) {
        effectiveCost = Math.round((effectivePackCost / pkgUnits) * 100) / 100;
      } else {
        effectiveCost = effectivePackCost;
      }

      // Update item cost_price for the line record
      item.cost_price = effectiveCost;
      totalCostPrice += Math.round((effectiveCost * item.quantity) * 100) / 100;
    }

    totalSellingPrice = Math.round(totalSellingPrice * 100) / 100;
    totalCostPrice = Math.round(totalCostPrice * 100) / 100;

    // Validate invoice-level discount
    const rawDiscount = Number(payload.discount || 0);
    const discount = Math.max(0, Math.min(totalSellingPrice, Math.round(rawDiscount * 100) / 100));
    const netTotal = Math.max(0, Math.round((totalSellingPrice - discount) * 100) / 100);
    const profit = Math.round((netTotal - totalCostPrice) * 100) / 100;

    // Paid amount & change validation
    const paid = payload.paid_amount !== undefined && payload.paid_amount !== null ? payload.paid_amount : netTotal;
    if ((payload.payment_method === 'نقدي' || payload.payment_method === 'دليفري') && paid < netTotal) {
      throw new Error(`المبلغ المدفوع (${paid} ج.م) أقل من إجمالي الفاتورة المطلوبة (${netTotal} ج.م).`);
    }
    const change = Math.max(0, Math.round((paid - netTotal) * 100) / 100);

    // 3. Insert sales_invoices Header
    database.prepare(`
      INSERT INTO sales_invoices (
        invoice_number, invoice_date, invoice_time, item_count,
        total_selling_price, total_cost_price, profit, year,
        discount, payment_method, client_name, client_phone, client_address, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      payload.payment_method,
      payload.client_name || '',
      payload.client_phone || '',
      payload.client_address || '',
      payload.notes || ''
    );

    // 4. Insert items, deduct stock, feed shortages_drafts
    const maxItemRow = database.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM sales_invoice_items').get() as { maxId: number };
    let currentItemId = maxItemRow.maxId;

    const maxShortageRow = database.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM shortages_drafts').get() as { maxId: number };
    let currentShortageId = maxShortageRow.maxId;

    const insertItemStmt = database.prepare(`
      INSERT INTO sales_invoice_items (
        id, invoice_number, line_number, item_id, item_name, quantity, unit_price, discount_pct, line_total, invoice_date, invoice_time, unit_type, cost_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStockStmt = database.prepare(`
      UPDATE items SET current_stock = ROUND(current_stock - ?, 4) WHERE item_id = ?
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
        item.cost_price || 0
      );

      // Fractional or pack deduction
      let deductQty = item.quantity;
      if (item.unit_type === 'unit') {
        const pkgUnits = item.package_units && item.package_units > 1 ? item.package_units : 1;
        deductQty = Math.round((item.quantity / pkgUnits) * 10000) / 10000;
      }

      updateStockStmt.run(deductQty, item.item_id);

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

    // 5. Update Treasury State
    if (payload.payment_method === 'نقدي' || payload.payment_method === 'دليفري') {
      database.prepare(`
        UPDATE treasury_state
        SET cash_balance = ROUND(cash_balance + ?, 2), last_updated = ?
        WHERE id = 1
      `).run(netTotal, fullTimestamp);
    }

    // 6. Balanced Double-Entry Accounting Ledger in general_ledger_2026
    try {
      const maxEntryRow = database.prepare('SELECT COALESCE(MAX(entry_id), 0) as maxId FROM general_ledger_2026').get() as { maxId: number };
      const newEntryId = maxEntryRow.maxId + 1;

      const debitAccount = (payload.payment_method === 'نقدي' || payload.payment_method === 'دليفري')
        ? 'اصول.متداولة.نقدية.كاش'
        : (payload.payment_method === 'آجل' ? 'اصول.متداولة.عملاء' : 'اصول.متداولة.بنك.فيزا');

      // 1. Debit Cash / Receivable / Card
      database.prepare(`
        INSERT OR IGNORE INTO general_ledger_2026 (
          entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        newEntryId,
        invoiceDate,
        debitAccount,
        `INV-${invoiceNumber}`,
        `مبيعات ${payload.payment_method} فاتورة #${invoiceNumber}`,
        netTotal,
        netTotal
      );

      // 2. Credit Sales Revenue (إيرادات مبيعات)
      database.prepare(`
        INSERT OR IGNORE INTO general_ledger_2026 (
          entry_id, entry_date, account_name, document_ref, notes, amount, debit, credit
        ) VALUES (?, ?, 'ايرادات.مبيعات', ?, ?, ?, 0, ?)
      `).run(
        newEntryId + 1,
        invoiceDate,
        `INV-${invoiceNumber}`,
        `إيراد مبيعات فاتورة #${invoiceNumber}`,
        -netTotal,
        netTotal
      );
    } catch (glErr: unknown) {
      const msg = glErr instanceof Error ? glErr.message : String(glErr);
      if (!msg.includes('UNIQUE constraint failed')) {
        console.error('Error posting sales invoice to general_ledger_2026:', glErr);
      }
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
      client_address: payload.client_address
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

    // 1. Strict validation: prevent returning items not on invoice or exceeding sold/remaining quantities
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new Error(`الكمية المراد إرجاعها للصنف "${item.item_name}" يجب أن تكون أكبر من الصفر.`);
      }

      const orig = originalItems.find(o => o.item_id === item.item_id);
      if (!orig) {
        throw new Error(`الصنف "${item.item_name}" (كود: ${item.item_id}) غير موجود في الفاتورة الأصلية رقم #${invoiceNumber}.`);
      }

      const alreadyReturned = Number(orig.returned_quantity || 0);
      const remaining = Math.round((orig.quantity - alreadyReturned) * 10000) / 10000;
      if (item.quantity > remaining + 0.0001) {
        throw new Error(`الكمية المراد إرجاعها (${item.quantity}) تتجاوز الكمية المتبقية القابلة للإرجاع (${remaining}) للصنف "${item.item_name}".`);
      }
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
    for (const item of items) {
      const orig = originalItems.find(o => o.item_id === item.item_id)!;
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
          tax_schedule_category = COALESCE(?, tax_schedule_category)
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

      database.prepare(`
        INSERT INTO items (
          item_id, barcode, item_name_en, item_name_ar, producer, generic_name, category,
          consumer_price, previous_price, package_units, discount_pct, buy_price,
          current_stock, expiry_date, pharmacy_discount_percent, tax_schedule_category
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        itemData.tax_schedule_category || 0
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
        expiry_date = CASE WHEN ? != '' THEN ? ELSE expiry_date END
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
      COALESCE(SUM(p.total_amount), 0) as total_purchases,
      MAX(p.invoice_date) as last_invoice_date,
      count(p.purchase_invoice_id) as invoices_count
    FROM suppliers s
    LEFT JOIN purchases_invoices p ON s.supplier_id = p.supplier_id
    GROUP BY s.supplier_id
    ORDER BY s.supplier_id ASC
  `).all() as Supplier[];
}

export function saveSupplier(supplierData: { supplier_id?: number; supplier_name: string; contact_phone?: string }): Supplier {
  const database = getDatabaseInstance();
  const trimmedName = supplierData.supplier_name.trim();
  if (!trimmedName) throw new Error('اسم المورد مطلوب');

  const tx = database.transaction(() => {
    if (supplierData.supplier_id) {
      database.prepare(`
        UPDATE suppliers 
        SET supplier_name = ?, contact_phone = COALESCE(?, contact_phone)
        WHERE supplier_id = ?
      `).run(trimmedName, supplierData.contact_phone || '', supplierData.supplier_id);
      return database.prepare('SELECT * FROM suppliers WHERE supplier_id = ?').get(supplierData.supplier_id) as Supplier;
    } else {
      const maxId = (database.prepare('SELECT COALESCE(MAX(supplier_id), 0) as m FROM suppliers').get() as { m: number }).m + 1;
      database.prepare(`
        INSERT INTO suppliers (supplier_id, supplier_name, contact_phone)
        VALUES (?, ?, ?)
      `).run(maxId, trimmedName, supplierData.contact_phone || '');
      return {
        supplier_id: maxId,
        supplier_name: trimmedName,
        contact_phone: supplierData.contact_phone || ''
      };
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
    WHERE entry_date = ? AND (account_name LIKE '%خصوم.متداولة.موردين%' OR account_name LIKE '%خصوم.موردين%') AND document_ref LIKE 'PAY-SUP%'
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
    SELECT user_id, user_name, is_active, permissions_mask
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



