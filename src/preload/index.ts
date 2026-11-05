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
  LedgerIntegrityStatus
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

  getInvoiceForReturn: (invoiceNumber: number): Promise<{ invoice: SalesInvoice; items: SalesInvoiceItem[] } | null> =>
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

  saveSupplier: (supplierData: { supplier_id?: number; supplier_name: string; contact_phone?: string }): Promise<Supplier> =>
    ipcRenderer.invoke('purchase:saveSupplier', supplierData),

  getPurchaseInvoices: (limit?: number): Promise<PurchaseInvoice[]> =>
    ipcRenderer.invoke('purchase:getInvoices', limit),

  getPurchaseInvoiceItems: (invoiceId: number): Promise<PurchaseInvoiceItem[]> =>
    ipcRenderer.invoke('purchase:getInvoiceItems', invoiceId),

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
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);


