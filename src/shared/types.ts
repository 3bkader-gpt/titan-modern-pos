export interface Item {
  item_id: number;
  item_name_en: string;
  item_name_ar: string;
  producer?: string | null;
  generic_name?: string | null;
  category?: string | null;
  consumer_price: number;
  previous_price?: number | null;
  package_units: number;
  discount_pct?: number | null;
  buy_price?: number | null;
  current_stock: number;
  expiry_date?: string | null;
  barcode?: string | null;
  barcode_source?: string | null;
  pharmacy_discount_percent?: number | null;
  tax_schedule_category?: number | null;
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
  payment_method?: string;
  client_name?: string;
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
}

export interface CreateSaleInvoicePayload {
  items: CreateSaleItemPayload[];
  discount: number;
  payment_method: 'نقدي' | 'فيزا' | 'محفظة / إنستاباي' | 'آجل' | 'دليفري';
  client_name?: string;
  client_phone?: string;
  client_address?: string;
  is_delivery?: boolean;
  notes?: string;
  paid_amount?: number;
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
  total_purchases?: number;
  last_invoice_date?: string | null;
  invoices_count?: number;
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

export interface UserAccount {
  user_id: number;
  user_name: string;
  is_active: number;
  permissions_mask?: string;
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


