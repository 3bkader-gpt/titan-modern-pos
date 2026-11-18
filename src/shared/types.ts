export type DiscountMode = 'AMOUNT' | 'TOTAL_PCT' | 'PROFIT_PCT' | 'WHOLESALE_COST';

export interface Item {
  item_id: number;
  item_name_en: string;
  item_name_ar: string;
  producer?: string | null;
  generic_name?: string | null;
  category?: string | null;
  consumer_price: number;
  previous_price?: number | null;
  temp_price?: number | null;
  temp_price_active?: number;
  package_units: number;
  discount_pct?: number | null;
  buy_price?: number | null;
  current_stock: number;
  expiry_date?: string | null;
  barcode?: string | null;
  barcode_source?: string | null;
  pharmacy_discount_percent?: number | null;
  tax_schedule_category?: number | null;
  short_code?: string | null;
  phonetic_key?: string | null;
  last_sold_at?: string | null;
  last_bought_at?: string | null;
}

export type SearchScope = 'ALL' | 'OUR_LIST' | 'IN_STOCK';

export interface AdvancedDrugSearchFilter {
  query?: string;
  scope?: SearchScope;
  genericName?: string;
  producer?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  shortCode?: string;
  limit?: number;
}

export interface MedicalAlert {
  type: 'pregnancy' | 'schedule' | 'interaction';
  severity: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  condition?: string;
}

export interface SalesInvoice {
  invoice_number: number;
  invoice_date: string;
  invoice_time: string;
  item_count: number;
  total_selling_price: number;
  total_cost_price: number;
  profit: number;
  year: number;
  discount?: number;
  discount_mode?: DiscountMode;
  discount_input_value?: number;
  override_manager_name?: string;
  payment_method?: string;
  client_name?: string;
  client_phone?: string;
  client_address?: string;
  notes?: string;
  user_id?: number;
  cashier_name?: string;
  edit_count?: number;
  last_edited_at?: string;
  last_edited_by?: string;
  is_locked?: number;
}

export interface SalesInvoiceItem {
  id: number;
  invoice_number: number;
  line_number: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  invoice_date?: string;
  invoice_time?: string;
  unit_type?: string;
  cost_price?: number;
  returned_quantity?: number;
  remaining_quantity?: number;
  effective_unit_price?: number;
}

export interface DashboardStats {
  totalCatalogItems: number;
  inStockItems: number;
  cashBalance: number;
  totalSalesInvoices: number;
  shortagesDraftsCount: number;
  suppliersCount: number;
  lastInvoiceNumber: number;
  lastInvoiceDate: string;
}

export type BackupStateCode = 'USB_CONNECTED' | 'LOCAL_ONLY' | 'BACKING_UP' | 'SUCCESS' | 'ERROR';

export interface BackupStatus {
  status: BackupStateCode;
  usbDrive?: string;
  lastBackupTime?: string;
  lastBackupFile?: string;
  backupSizeMB?: number;
  message?: string;
}

export interface SearchOptions {
  filterInStockOnly?: boolean;
  limit?: number;
}

// Phase 2: POS Engine Payloads & Results
export interface CreateSaleItemPayload {
  item_id: number;
  item_name: string;
  item_name_ar?: string;
  generic_name?: string;
  quantity: number;
  unit_type: 'pack' | 'unit'; // 'عبوة' | 'شريط-وحدة'
  package_units: number;
  unit_price: number; // calculated according to unit_type
  cost_price: number; // calculated according to unit_type
  discount_pct: number;
  line_total: number;
  tax_schedule_category?: number | null;
  applied_price_source?: 'CONSUMER' | 'TEMP_PRICE';
  temp_price?: number | null;
  temp_price_active?: number;
}

export interface CreateSaleInvoicePayload {
  items: CreateSaleItemPayload[];
  discount: number;
  discount_mode?: DiscountMode;
  discount_input_value?: number;
  payment_method: 'نقدي' | 'فيزا' | 'محفظة / إنستاباي' | 'آجل' | 'دليفري';
  client_name?: string;
  client_phone?: string;
  client_address?: string;
  is_delivery?: boolean;
  notes?: string;
  paid_amount?: number;
  user_id?: number;
  cashier_name?: string;
  user_role?: UserRole;
  manager_override_pin?: string;
  override_manager_name?: string;
}

export interface CreateSaleInvoiceResult {
  success: boolean;
  invoice_number: number;
  invoice_date: string;
  invoice_time: string;
  total_selling_price: number;
  total_cost_price: number;
  profit: number;
  discount: number;
  payment_method: string;
  item_count: number;
  change: number;
  items: CreateSaleItemPayload[];
  client_name?: string;
  client_phone?: string;
  client_address?: string;
}

export interface ReturnItemPayload {
  invoice_item_id?: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_type: 'pack' | 'unit';
  package_units: number;
  unit_price: number;
}

export interface ReturnSaleInvoiceResult {
  success: boolean;
  invoice_number: number;
  total_refunded: number;
  items_returned_count: number;
  payment_method?: string;
  message?: string;
}

export interface SalesReturn {
  id: number;
  invoice_number: number;
  line_number?: number;
  item_id: number;
  item_name: string;
  unit_type: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  effective_unit_price: number;
  refund_amount: number;
  payment_method: string;
  return_date: string;
  return_time: string;
  return_timestamp: string;
  user_name?: string;
  notes?: string;
}

export interface Customer {
  customer_id: number;
  customer_name: string;
  phone?: string | null;
  address?: string | null;
  account_balance: number;
}

// Phase 3: Inventory, Purchases, Suppliers & Shortages
export interface ItemFullHistory {
  item: Item;
  salesHistory: {
    invoice_number: number;
    invoice_date: string;
    invoice_time: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    unit_type?: string;
  }[];
  purchasesHistory: {
    purchase_invoice_id: number;
    invoice_date: string;
    supplier_name: string;
    quantity: number;
    bonus_quantity?: number;
    consumer_price: number;
    buy_price: number;
    line_total: number;
  }[];
  priceChangesHistory: {
    id: number;
    old_price?: number;
    new_price: number;
    change_timestamp: string;
  }[];
}

export type InventoryFilterType = 'all' | 'in_stock' | 'zero_stock' | 'near_expiry' | 'scheduled' | 'recent_price_changes';

export interface InventoryFilterResult {
  items: Item[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_phone?: string | null;
  tax_id?: string | null;
  address?: string | null;
  credit_limit?: number;
  opening_balance?: number;
  total_purchases?: number;
  total_paid?: number;
  total_returns?: number;
  current_balance?: number;
  last_invoice_date?: string | null;
  invoices_count?: number;
}

export interface SupplierStatementEntry {
  entry_key: string;
  date: string;
  type: 'OPENING' | 'PURCHASE_CREDIT' | 'PURCHASE_CASH' | 'PAYMENT' | 'PURCHASE_RETURN' | 'EXPIRY_RETURN';
  label: string;
  reference: string;
  debit_effect: number; // reduces payable (payments, supplier-credit returns)
  credit_effect: number; // increases payable (credit purchases, opening balance)
  running_balance: number;
  notes?: string;
}

export interface SupplierStatementReport {
  supplier: Supplier;
  opening_balance: number;
  total_purchases_credit: number;
  total_purchases_cash: number;
  total_payments: number;
  total_returns_credit: number;
  closing_balance: number;
  total_gl_suppliers_payable: number;
  entries: SupplierStatementEntry[];
}

export interface RecordSupplierPaymentPayload {
  supplier_id: number;
  amount: number;
  notes?: string;
  user_id?: number;
  cashier_name?: string;
}

export interface CreatePurchaseReturnItemPayload {
  item_id: number;
  item_name: string;
  quantity: number;
  unit_cost: number;
  expiry_date?: string;
}

export interface CreatePurchaseReturnPayload {
  supplier_id: number;
  original_purchase_id?: number;
  return_type: 'PURCHASE_RETURN' | 'EXPIRY_RETURN';
  settlement_mode: 'SUPPLIER_CREDIT' | 'CASH_REFUND';
  compensation_pct?: number; // 0..100 (default 100)
  items: CreatePurchaseReturnItemPayload[];
  user_id?: number;
  cashier_name?: string;
  notes?: string;
}

export interface PurchaseReturnRecord {
  return_id: number;
  supplier_id: number;
  supplier_name: string;
  original_purchase_id: number;
  return_type: 'PURCHASE_RETURN' | 'EXPIRY_RETURN';
  settlement_mode: 'SUPPLIER_CREDIT' | 'CASH_REFUND';
  total_cost_value: number;
  credit_amount: number;
  expiry_loss_amount: number;
  user_id: number;
  cashier_name: string;
  notes: string;
  return_date: string;
  items_count?: number;
}

export interface PurchaseInvoice {
  purchase_invoice_id: number;
  supplier_id: number;
  supplier_name: string;
  invoice_date: string;
  item_count: number;
  total_amount: number;
  paper_invoice_number?: string;
  payment_method?: string;
  notes?: string;
}

export interface PurchaseInvoiceItem {
  id: number;
  purchase_invoice_id: number;
  line_number: number;
  item_id: number;
  item_name: string;
  quantity: number;
  bonus_quantity?: number;
  consumer_price: number;
  discount_pct?: number;
  buy_price: number;
  line_total: number;
  expiry_date?: string;
}

export interface CreatePurchaseItemPayload {
  item_id: number;
  item_name: string;
  quantity: number;
  bonus_quantity?: number;
  consumer_price: number;
  discount_pct?: number;
  buy_price: number;
  expiry_date?: string;
  line_total: number;
}

export interface CreatePurchaseInvoicePayload {
  supplier_id: number;
  supplier_name: string;
  paper_invoice_number?: string;
  invoice_date?: string;
  payment_method: 'نقدي' | 'آجل';
  items: CreatePurchaseItemPayload[];
  notes?: string;
}

export interface CreatePurchaseInvoiceResult {
  success: boolean;
  purchase_invoice_id: number;
  supplier_name: string;
  item_count: number;
  total_amount: number;
  invoice_date: string;
}

export interface ShortageItem {
  shortage_id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  supplier_id: number;
  supplier_name: string;
  order_code?: string;
  item_name_ar?: string;
  generic_name?: string;
  producer?: string;
  consumer_price: number;
  buy_price?: number;
  discount_pct?: number;
  package_units: number;
  current_stock: number;
  barcode?: string;
}

export interface SaveItemPayload {
  item_id?: number;
  barcode?: string;
  item_name_en: string;
  item_name_ar?: string;
  producer?: string;
  generic_name?: string;
  category?: string;
  consumer_price: number;
  package_units: number;
  discount_pct?: number;
  buy_price?: number;
  current_stock: number;
  expiry_date?: string;
  pharmacy_discount_percent?: number;
  tax_schedule_category?: number;
  temp_price?: number;
  temp_price_active?: number;
  short_code?: string | null;
}

export interface ItemBarcodeEntry {
  id: number;
  item_id: number;
  barcode: string;
  label: string;
  is_primary: number;
  created_at: string;
}

// Phase 4: Treasury, Shifts, Customers & Delivery, Financial & Audit Reports
export interface LedgerEntry {
  entry_id: number;
  entry_date: string;
  account_name: string;
  document_ref?: string;
  notes?: string;
  amount: number;
  debit: number;
  credit: number;
}

export interface TreasuryOverview {
  cash_balance: number;
  today_inflow: number;
  today_outflow: number;
  net_today: number;
  recent_entries: LedgerEntry[];
}

export interface RecordTreasuryTransactionPayload {
  type: 'EXPENSE' | 'DEPOSIT' | 'WITHDRAWAL' | 'SUPPLIER_PAYMENT';
  category: string;
  amount: number;
  notes?: string;
  supplier_id?: number;
}

export interface WorkShift {
  shift_id: number;
  user_id?: number;
  user_name: string;
  start_time: string;
  end_time?: string | null;
  status: 'OPEN' | 'CLOSED';
  opening_balance: number;
  actual_cash_counted?: number | null;
  discrepancy?: number | null;
  total_sales: number;
  cash_sales: number;
  card_sales: number;
  credit_sales: number;
  returns_amount: number;
  expenses_amount: number;
  notes?: string | null;
}

export interface DeliveryOrder {
  order_id: number;
  item_ordered?: string;
  order_timestamp: string;
  status: string;
  customer_name?: string;
  phone?: string;
  address?: string;
  invoice_number?: number;
  total_amount?: number;
}

export interface FinancialReport {
  startDate: string;
  endDate: string;
  total_sales: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  total_purchases: number;
  total_expenses: number;
  net_profit: number;
  net_cash_flow: number;
  invoices_count: number;
  daily_breakdown: Array<{
    date: string;
    sales: number;
    profit: number;
    expenses: number;
  }>;
}

export interface TopItem {
  item_id: number;
  item_name_en: string;
  item_name_ar?: string;
  total_quantity_sold: number;
  total_revenue: number;
  total_profit: number;
  current_stock: number;
}

export interface StagnantItem {
  item_id: number;
  item_name_en: string;
  item_name_ar?: string;
  current_stock: number;
  consumer_price: number;
  buy_price: number;
  producer?: string;
}

export interface NearExpiryItem {
  item_id: number;
  item_name_en: string;
  item_name_ar?: string;
  expiry_date: string;
  current_stock: number;
  consumer_price: number;
  buy_price: number;
  urgency: 'EXPIRED' | 'CRITICAL' | 'WARNING';
}

export interface StockValuationReport {
  total_in_stock_items: number;
  total_pieces: number;
  total_cost_value: number;
  total_consumer_value: number;
  potential_profit: number;
  expired_count: number;
  near_expiry_3m_count: number;
  near_expiry_6m_count: number;
  near_expiry_items: NearExpiryItem[];
}

export type UserRole = 'ADMIN' | 'PHARMACIST' | 'CASHIER';

export interface UserAccount {
  user_id: number;
  user_name: string;
  is_active: number;
  permissions_mask?: number | string;
  role?: UserRole;
  allowed_tabs?: string;
  badge_barcode?: string;
  max_discount_pct?: number;
  commission_pct?: number;
}

export interface AuthSession {
  user_id: number;
  user_name: string;
  role: UserRole;
  allowed_tabs: string[];
  max_discount_pct: number;
  badge_barcode: string;
  logged_in_at: string;
}

export interface LoginAuditEntry {
  id: number;
  user_id: number;
  user_name: string;
  action_type: 'LOGIN' | 'LOGOUT' | 'SWITCH_USER' | 'MANAGER_OVERRIDE' | 'FAILED_PIN';
  authorized_by_id?: number | null;
  authorized_by_name?: string;
  target_ref?: string;
  created_at: string;
}

export interface SaveUserPayload {
  user_id?: number;
  user_name: string;
  pin_code?: string;
  role: UserRole;
  allowed_tabs?: string[];
  max_discount_pct?: number;
  commission_pct?: number;
  is_active?: number;
}

export interface InvoiceEditEligibility {
  can_edit: boolean;
  reason?: string;
  requires_manager_override?: boolean;
  invoice?: SalesInvoice;
}

export interface EditableSaleInvoiceLine {
  item_id: number;
  item_name: string;
  item_name_ar?: string;
  generic_name?: string;
  quantity: number;
  unit_type: 'pack' | 'unit';
  package_units: number;
  unit_price: number;
  cost_price: number;
  discount_pct: number;
  line_total: number;
  tax_schedule_category?: number | null;
  current_stock: number;
  base_consumer_price: number;
  base_buy_price: number;
  applied_price_source?: 'CONSUMER' | 'TEMP_PRICE';
  temp_price?: number | null;
  temp_price_active?: number;
}

export interface EditableSaleInvoiceData {
  invoice: SalesInvoice;
  items: EditableSaleInvoiceLine[];
}

export interface UpdateSaleInvoicePayload extends CreateSaleInvoicePayload {
  invoice_number: number;
  editor_user_id: number;
  editor_user_name: string;
  editor_role: UserRole;
  manager_override_pin?: string;
  reason?: string;
}

export interface InvoiceRevisionEntry {
  revision_id: number;
  invoice_id: number;
  revision_number: number;
  edited_by_user_id: number;
  edited_by_user_name: string;
  authorized_by_name?: string;
  old_total: number;
  new_total: number;
  old_payment_method: string;
  new_payment_method: string;
  old_snapshot_json: string;
  new_snapshot_json: string;
  reason?: string;
  created_at: string;
}

export interface AuditLogs {
  price_changes: Array<{
    id: number;
    item_id: number;
    item_name_en: string;
    old_price: number;
    new_price: number;
    changed_at: string;
  }>;
  voids_and_returns: Array<{
    id: number;
    sale_timestamp: string;
    user_name: string;
    item_name: string;
    unit_price: number;
    invoice_id?: number;
  }>;
  stock_adjustments?: Array<{
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
}

export interface LedgerIntegrityStatus {
  balanced: boolean;
  total_debit: number;
  total_credit: number;
  diff: number;
  message: string;
}

export interface StorageInfo {
  activeDbPath: string;
  dataDir: string;
  backupsDir: string;
  dbSizeMB: number;
  isCustomConfigured: boolean;
}

export interface ChangeDataDirResult {
  success: boolean;
  canceled?: boolean;
  activeDbPath?: string;
  dataDir?: string;
  backupsDir?: string;
  mode?: 'migrated' | 'attached_existing' | 'confirmed_current';
  message?: string;
}

