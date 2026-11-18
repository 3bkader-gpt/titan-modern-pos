import { contextBridge, ipcRenderer } from 'electron';
import { 
  Item, 
  MedicalAlert, 
  SalesInvoice, 
  SalesInvoiceItem, 
  DashboardStats, 
  BackupStatus,
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
  CreatePurchaseInvoicePayload,
  CreatePurchaseInvoiceResult,
  ShortageItem,
  SaveItemPayload,
  TreasuryOverview,
  RecordTreasuryTransactionPayload,
  WorkShift,
  DeliveryOrder,
  FinancialReport,
  StockValuationReport,
  TopItem,
  StagnantItem,
  UserAccount,
  AuditLogs,
  LedgerIntegrityStatus,
  StorageInfo,
  ChangeDataDirResult,
  AuthSession,
  LoginAuditEntry,
  SaveUserPayload,
  SupplierStatementReport,
  RecordSupplierPaymentPayload,
  CreatePurchaseReturnPayload,
  PurchaseReturnRecord,
  UserRole,
  InvoiceEditEligibility,
  EditableSaleInvoiceData,
  UpdateSaleInvoicePayload,
  InvoiceRevisionEntry
} from '../shared/types';

export const electronAPI = {
  checkLedgerIntegrity: (): Promise<LedgerIntegrityStatus> =>
    ipcRenderer.invoke('db:checkLedgerIntegrity'),
  searchItems: (query: string, filterInStockOnly?: boolean, limit?: number): Promise<Item[]> =>
    ipcRenderer.invoke('db:searchItems', query, filterInStockOnly, limit),

  getAlternatives: (itemId: number): Promise<Item[]> =>
    ipcRenderer.invoke('db:getAlternatives', itemId),

  getMedicalAlerts: (genericName?: string | null, taxCategory?: number | null): Promise<MedicalAlert[]> =>
    ipcRenderer.invoke('db:getMedicalAlerts', genericName, taxCategory),

  getDashboardStats: (): Promise<DashboardStats> =>
    ipcRenderer.invoke('db:getDashboardStats'),

  getRecentSalesInvoices: (limit?: number): Promise<SalesInvoice[]> =>
    ipcRenderer.invoke('db:getRecentSalesInvoices', limit),

  getSalesInvoiceItems: (invoiceNumber: number): Promise<SalesInvoiceItem[]> =>
    ipcRenderer.invoke('db:getSalesInvoiceItems', invoiceNumber),

  // Phase 2 POS APIs
  createSaleInvoice: (payload: CreateSaleInvoicePayload): Promise<CreateSaleInvoiceResult> =>
    ipcRenderer.invoke('pos:createSaleInvoice', payload),

  returnSaleInvoice: (invoiceNumber: number, itemsToReturn?: ReturnItemPayload[]): Promise<ReturnSaleInvoiceResult> =>
    ipcRenderer.invoke('pos:returnSaleInvoice', invoiceNumber, itemsToReturn),

  getCustomers: (query?: string): Promise<Customer[]> =>
    ipcRenderer.invoke('pos:getCustomers', query),

  addCustomer: (name: string, phone?: string, address?: string): Promise<Customer> =>
    ipcRenderer.invoke('pos:addCustomer', name, phone, address),

  getInvoiceForReturn: (invoiceNumber: number): Promise<{ invoice: SalesInvoice; items: SalesInvoiceItem[]; is_fully_returned?: boolean } | null> =>
    ipcRenderer.invoke('pos:getInvoiceForReturn', invoiceNumber),

  // Phase 3 Inventory APIs
  getInventoryFilter: (filterType: InventoryFilterType, page: number, limit: number, searchQuery?: string): Promise<InventoryFilterResult> =>
    ipcRenderer.invoke('inv:getFilter', filterType, page, limit, searchQuery),

  getItemFullHistory: (itemId: number): Promise<ItemFullHistory | null> =>
    ipcRenderer.invoke('inv:getItemFullHistory', itemId),

  saveOrUpdateItem: (itemData: SaveItemPayload): Promise<Item> =>
    ipcRenderer.invoke('inv:saveOrUpdateItem', itemData),

  adjustStock: (itemId: number, newStock: number, newExpiry?: string, reason?: string): Promise<Item> =>
    ipcRenderer.invoke('inv:adjustStock', itemId, newStock, newExpiry, reason),

  // Phase 3 Purchases & Suppliers APIs
  createPurchaseInvoice: (payload: CreatePurchaseInvoicePayload): Promise<CreatePurchaseInvoiceResult> =>
    ipcRenderer.invoke('purchase:createInvoice', payload),

  getSuppliers: (): Promise<Supplier[]> =>
    ipcRenderer.invoke('purchase:getSuppliers'),

  saveSupplier: (supplierData: {
    supplier_id?: number;
    supplier_name: string;
    contact_phone?: string;
    tax_id?: string;
    address?: string;
    credit_limit?: number;
    opening_balance?: number;
  }): Promise<Supplier> =>
    ipcRenderer.invoke('purchase:saveSupplier', supplierData),

  getPurchaseInvoices: (limit?: number): Promise<PurchaseInvoice[]> =>
    ipcRenderer.invoke('purchase:getInvoices', limit),

  getPurchaseInvoiceItems: (invoiceId: number): Promise<PurchaseInvoiceItem[]> =>
    ipcRenderer.invoke('purchase:getInvoiceItems', invoiceId),

  getSupplierStatement: (supplierId: number, fromDate?: string, toDate?: string): Promise<SupplierStatementReport> =>
    ipcRenderer.invoke('purchase:getSupplierStatement', supplierId, fromDate, toDate),

  recordSupplierPayment: (payload: RecordSupplierPaymentPayload): Promise<{
    success: boolean;
    tx_id: number;
    supplier_id: number;
    supplier_name: string;
    amount: number;
    new_treasury_balance: number;
  }> =>
    ipcRenderer.invoke('purchase:recordSupplierPayment', payload),

  createPurchaseReturn: (payload: CreatePurchaseReturnPayload): Promise<PurchaseReturnRecord> =>
    ipcRenderer.invoke('purchase:createPurchaseReturn', payload),

  getPurchaseReturns: (supplierId?: number, limit?: number): Promise<PurchaseReturnRecord[]> =>
    ipcRenderer.invoke('purchase:getPurchaseReturns', supplierId, limit),

  // Phase 3 Shortages APIs
  getShortages: (supplierFilter?: number, searchQuery?: string): Promise<ShortageItem[]> =>
    ipcRenderer.invoke('shortage:getShortages', supplierFilter, searchQuery),

  addOrUpdateShortage: (itemId: number, quantity: number, supplierId?: number): Promise<ShortageItem> =>
    ipcRenderer.invoke('shortage:addOrUpdate', itemId, quantity, supplierId),

  removeShortage: (shortageId: number): Promise<{ success: boolean; shortageId: number }> =>
    ipcRenderer.invoke('shortage:remove', shortageId),

  clearCompletedShortages: (): Promise<{ clearedCount: number }> =>
    ipcRenderer.invoke('shortage:clearCompleted'),

  // Phase 4 Treasury APIs
  getTreasuryOverview: (): Promise<TreasuryOverview> =>
    ipcRenderer.invoke('treasury:getOverview'),

  recordTreasuryTransaction: (payload: RecordTreasuryTransactionPayload): Promise<{ success: boolean; new_balance: number; entry_id: number }> =>
    ipcRenderer.invoke('treasury:recordTransaction', payload),

  // Phase 4 Shifts APIs
  getCurrentShift: (): Promise<WorkShift | null> =>
    ipcRenderer.invoke('shifts:getCurrent'),

  openShift: (userId: number, userName: string, openingBalance?: number): Promise<WorkShift> =>
    ipcRenderer.invoke('shifts:open', userId, userName, openingBalance),

  closeShift: (shiftId: number, actualCashCounted: number, notes?: string): Promise<WorkShift> =>
    ipcRenderer.invoke('shifts:close', shiftId, actualCashCounted, notes),

  getShiftsHistory: (limit?: number): Promise<WorkShift[]> =>
    ipcRenderer.invoke('shifts:getHistory', limit),

  // Phase 4 Customers & Delivery APIs
  getCustomersWithBalances: (searchQuery?: string): Promise<Customer[]> =>
    ipcRenderer.invoke('cust:getWithBalances', searchQuery),

  recordCustomerPayment: (customerId: number, amount: number, notes?: string): Promise<{ success: boolean; new_balance: number; new_customer_balance: number }> =>
    ipcRenderer.invoke('cust:recordPayment', customerId, amount, notes),

  getDeliveryOrders: (statusFilter?: string, searchQuery?: string, limit?: number): Promise<DeliveryOrder[]> =>
    ipcRenderer.invoke('delivery:getOrders', statusFilter, searchQuery, limit),

  updateDeliveryStatus: (orderId: number, newStatus: string): Promise<{ success: boolean; order_id: number; status: string }> =>
    ipcRenderer.invoke('delivery:updateStatus', orderId, newStatus),

  // Phase 4 Reports & Analytics APIs
  getFinancialReport: (startDate?: string, endDate?: string): Promise<FinancialReport> =>
    ipcRenderer.invoke('reports:getFinancial', startDate, endDate),

  getTopMovingAndStagnantItems: (limit?: number): Promise<{ topItems: TopItem[]; stagnantItems: StagnantItem[] }> =>
    ipcRenderer.invoke('reports:getTopStagnant', limit),

  getExpiryAndStockValuationReport: (): Promise<StockValuationReport> =>
    ipcRenderer.invoke('reports:getValuation'),

  getUsersAndAuditLogs: (limit?: number): Promise<{ users: UserAccount[]; auditLogs: AuditLogs }> =>
    ipcRenderer.invoke('reports:getAuditLogs', limit),

  // Backup APIs
  performBackup: (): Promise<BackupStatus> =>
    ipcRenderer.invoke('backup:perform'),

  getBackupStatus: (): Promise<BackupStatus> =>
    ipcRenderer.invoke('backup:getStatus'),

  onBackupStatusChange: (callback: (status: BackupStatus) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, status: BackupStatus) => callback(status);
    ipcRenderer.on('backup:statusChanged', subscription);
    return () => {
      ipcRenderer.removeListener('backup:statusChanged', subscription);
    };
  },

  // Data Storage Configuration APIs
  getStorageInfo: (): Promise<StorageInfo> =>
    ipcRenderer.invoke('storage:getInfo'),

  chooseDataDirectory: (): Promise<ChangeDataDirResult> =>
    ipcRenderer.invoke('storage:chooseDirectory'),

  confirmCurrentDataDirectory: (): Promise<StorageInfo> =>
    ipcRenderer.invoke('storage:confirmCurrent'),

  openDataDirectory: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('storage:openInExplorer'),

  // Module 1: RBAC Authentication & Manager Elevation APIs
  listActiveUsers: (): Promise<UserAccount[]> =>
    ipcRenderer.invoke('auth:listActiveUsers'),

  authenticateUser: (userIdOrBadge: number | string, pinCode: string): Promise<AuthSession> =>
    ipcRenderer.invoke('auth:login', userIdOrBadge, pinCode),

  verifyManagerOverride: (pinCode: string, currentUserId: number, actionLabel: string, targetRef?: string): Promise<{ ok: boolean; managerId: number; managerName: string }> =>
    ipcRenderer.invoke('auth:verifyManagerOverride', pinCode, currentUserId, actionLabel, targetRef),

  saveOrUpdateUserAccount: (payload: SaveUserPayload): Promise<UserAccount> =>
    ipcRenderer.invoke('auth:saveUser', payload),

  getLoginAuditLogs: (limit?: number): Promise<LoginAuditEntry[]> =>
    ipcRenderer.invoke('auth:getLoginAuditLogs', limit),

  // Module 3: Same-Day Unsave & Edit Sales Invoice APIs
  checkCanEditSaleInvoice: (invoiceNumber: number, currentUserId: number, currentUserRole: UserRole): Promise<InvoiceEditEligibility> =>
    ipcRenderer.invoke('pos:checkCanEditInvoice', invoiceNumber, currentUserId, currentUserRole),

  getSaleInvoiceForEdit: (invoiceNumber: number): Promise<EditableSaleInvoiceData | null> =>
    ipcRenderer.invoke('pos:getInvoiceForEdit', invoiceNumber),

  updateSavedSaleInvoice: (payload: UpdateSaleInvoicePayload): Promise<CreateSaleInvoiceResult> =>
    ipcRenderer.invoke('pos:updateSavedInvoice', payload),

  getInvoiceRevisions: (invoiceNumber: number): Promise<InvoiceRevisionEntry[]> =>
    ipcRenderer.invoke('pos:getInvoiceRevisions', invoiceNumber)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);


