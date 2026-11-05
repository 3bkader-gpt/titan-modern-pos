/// <reference types="vite/client" />

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
  AuditLogs
} from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      searchItems: (query: string, filterInStockOnly?: boolean, limit?: number) => Promise<Item[]>;
      getAlternatives: (itemId: number) => Promise<Item[]>;
      getMedicalAlerts: (genericName?: string | null, taxCategory?: number | null) => Promise<MedicalAlert[]>;
      getDashboardStats: () => Promise<DashboardStats>;
      getRecentSalesInvoices: (limit?: number) => Promise<SalesInvoice[]>;
      getSalesInvoiceItems: (invoiceNumber: number) => Promise<SalesInvoiceItem[]>;
      createSaleInvoice: (payload: CreateSaleInvoicePayload) => Promise<CreateSaleInvoiceResult>;
      returnSaleInvoice: (invoiceNumber: number, itemsToReturn?: ReturnItemPayload[]) => Promise<ReturnSaleInvoiceResult>;
      getCustomers: (query?: string) => Promise<Customer[]>;
      addCustomer: (name: string, phone?: string, address?: string) => Promise<Customer>;
      getInvoiceForReturn: (invoiceNumber: number) => Promise<{ invoice: SalesInvoice; items: SalesInvoiceItem[] } | null>;
      
      // Phase 3 APIs
      getInventoryFilter: (filterType: InventoryFilterType, page: number, limit: number, searchQuery?: string) => Promise<InventoryFilterResult>;
      getItemFullHistory: (itemId: number) => Promise<ItemFullHistory | null>;
      saveOrUpdateItem: (itemData: SaveItemPayload) => Promise<Item>;
      adjustStock: (itemId: number, newStock: number, newExpiry?: string, reason?: string) => Promise<Item>;

      createPurchaseInvoice: (payload: CreatePurchaseInvoicePayload) => Promise<CreatePurchaseInvoiceResult>;
      getSuppliers: () => Promise<Supplier[]>;
      saveSupplier: (supplierData: { supplier_id?: number; supplier_name: string; contact_phone?: string }) => Promise<Supplier>;
      getPurchaseInvoices: (limit?: number) => Promise<PurchaseInvoice[]>;
      getPurchaseInvoiceItems: (invoiceId: number) => Promise<PurchaseInvoiceItem[]>;

      getShortages: (supplierFilter?: number, searchQuery?: string) => Promise<ShortageItem[]>;
      addOrUpdateShortage: (itemId: number, quantity: number, supplierId?: number) => Promise<ShortageItem>;
      removeShortage: (shortageId: number) => Promise<{ success: boolean; shortageId: number }>;
      clearCompletedShortages: () => Promise<{ clearedCount: number }>;

      // Phase 4 APIs
      getTreasuryOverview: () => Promise<TreasuryOverview>;
      recordTreasuryTransaction: (payload: RecordTreasuryTransactionPayload) => Promise<{ success: boolean; new_balance: number; entry_id: number }>;

      getCurrentShift: () => Promise<WorkShift | null>;
      openShift: (userId: number, userName: string, openingBalance?: number) => Promise<WorkShift>;
      closeShift: (shiftId: number, actualCashCounted: number, notes?: string) => Promise<WorkShift>;
      getShiftsHistory: (limit?: number) => Promise<WorkShift[]>;

      getCustomersWithBalances: (searchQuery?: string) => Promise<Customer[]>;
      recordCustomerPayment: (customerId: number, amount: number, notes?: string) => Promise<{ success: boolean; new_balance: number; new_customer_balance: number }>;
      getDeliveryOrders: (statusFilter?: string, searchQuery?: string, limit?: number) => Promise<DeliveryOrder[]>;
      updateDeliveryStatus: (orderId: number, newStatus: string) => Promise<{ success: boolean; order_id: number; status: string }>;

      getFinancialReport: (startDate?: string, endDate?: string) => Promise<FinancialReport>;
      getTopMovingAndStagnantItems: (limit?: number) => Promise<{ topItems: TopItem[]; stagnantItems: StagnantItem[] }>;
      getExpiryAndStockValuationReport: () => Promise<StockValuationReport>;
      getUsersAndAuditLogs: (limit?: number) => Promise<{ users: UserAccount[]; auditLogs: AuditLogs }>;

      performBackup: () => Promise<BackupStatus>;
      getBackupStatus: () => Promise<BackupStatus>;
      onBackupStatusChange: (callback: (status: BackupStatus) => void) => () => void;
    };
  }
}
