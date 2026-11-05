import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import path from 'path';
import { 
  initDatabase,
  checkLedgerIntegrity, 
  searchItems, 
  getAlternatives, 
  getMedicalAlerts, 
  getDashboardStats, 
  getRecentSalesInvoices, 
  getSalesInvoiceItems,
  createSaleInvoice,
  returnSaleInvoice,
  getCustomers,
  addCustomer,
  getInvoiceForReturn,
  getInventoryFilter,
  getItemFullHistory,
  saveOrUpdateItem,
  adjustItemStock,
  createPurchaseInvoice,
  getSuppliers,
  saveSupplier,
  getPurchaseInvoices,
  getPurchaseInvoiceItems,
  getShortages,
  addOrUpdateShortage,
  removeShortage,
  clearCompletedShortages,
  getTreasuryOverview,
  recordTreasuryTransaction,
  getCurrentShift,
  openShift,
  closeShift,
  getShiftsHistory,
  getCustomersWithBalances,
  recordCustomerPayment,
  getDeliveryOrders,
  updateDeliveryStatus,
  getFinancialReport,
  getTopMovingAndStagnantItems,
  getExpiryAndStockValuationReport,
  getUsersAndAuditLogs
} from './db';
import { 
  performBackup, 
  getCurrentBackupStatus, 
  startUsbWatcher, 
  onBackupStatusChanged 
} from './backup';
import { 
  CreateSaleInvoicePayload, 
  ReturnItemPayload,
  InventoryFilterType,
  SaveItemPayload,
  CreatePurchaseInvoicePayload,
  RecordTreasuryTransactionPayload
} from '../shared/types';

import fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'Mariam Elhomeily Pharmacy - صيدلية د. مريم الحميلي',
    backgroundColor: '#f4f6fa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  const isDevServer = process.env.VITE_DEV_SERVER === '1';

  if (isDevServer) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const candidateHtmlPaths = [
      path.join(__dirname, '../dist/index.html'),
      path.join(app.getAppPath(), 'dist/index.html'),
      path.join(__dirname, 'index.html')
    ];
    let loaded = false;
    for (const htmlPath of candidateHtmlPaths) {
      if (fs.existsSync(htmlPath)) {
        mainWindow.loadFile(htmlPath);
        loaded = true;
        break;
      }
    }
    if (!loaded) {
      mainWindow.loadURL('http://localhost:5173');
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  // DB & Search Handlers
  ipcMain.handle('db:checkLedgerIntegrity', async () => {
    return checkLedgerIntegrity();
  });

  ipcMain.handle('db:searchItems', async (_event, query: string, filterInStockOnly?: boolean, limit?: number) => {
    return searchItems(query, filterInStockOnly, limit);
  });

  ipcMain.handle('db:getAlternatives', async (_event, itemId: number) => {
    return getAlternatives(itemId);
  });

  ipcMain.handle('db:getMedicalAlerts', async (_event, genericName?: string | null, taxCategory?: number | null) => {
    return getMedicalAlerts(genericName, taxCategory);
  });

  ipcMain.handle('db:getDashboardStats', async () => {
    return getDashboardStats();
  });

  ipcMain.handle('db:getRecentSalesInvoices', async (_event, limit?: number) => {
    return getRecentSalesInvoices(limit);
  });

  ipcMain.handle('db:getSalesInvoiceItems', async (_event, invoiceNumber: number) => {
    return getSalesInvoiceItems(invoiceNumber);
  });

  // Phase 2 POS Handlers
  ipcMain.handle('pos:createSaleInvoice', async (_event, payload: CreateSaleInvoicePayload) => {
    return createSaleInvoice(payload);
  });

  ipcMain.handle('pos:returnSaleInvoice', async (_event, invoiceNumber: number, itemsToReturn?: ReturnItemPayload[]) => {
    return returnSaleInvoice(invoiceNumber, itemsToReturn);
  });

  ipcMain.handle('pos:getCustomers', async (_event, query?: string) => {
    return getCustomers(query);
  });

  ipcMain.handle('pos:addCustomer', async (_event, name: string, phone?: string, address?: string) => {
    return addCustomer(name, phone, address);
  });

  ipcMain.handle('pos:getInvoiceForReturn', async (_event, invoiceNumber: number) => {
    return getInvoiceForReturn(invoiceNumber);
  });

  // Phase 3 Inventory Handlers
  ipcMain.handle('inv:getFilter', async (_event, filterType: InventoryFilterType, page: number, limit: number, searchQuery?: string) => {
    return getInventoryFilter(filterType, page, limit, searchQuery);
  });

  ipcMain.handle('inv:getItemFullHistory', async (_event, itemId: number) => {
    return getItemFullHistory(itemId);
  });

  ipcMain.handle('inv:saveOrUpdateItem', async (_event, itemData: SaveItemPayload) => {
    return saveOrUpdateItem(itemData);
  });

  ipcMain.handle('inv:adjustStock', async (_event, itemId: number, newStock: number, newExpiry?: string, reason?: string) => {
    return adjustItemStock(itemId, newStock, newExpiry, reason);
  });

  // Phase 3 Purchases & Suppliers Handlers
  ipcMain.handle('purchase:createInvoice', async (_event, payload: CreatePurchaseInvoicePayload) => {
    return createPurchaseInvoice(payload);
  });

  ipcMain.handle('purchase:getSuppliers', async () => {
    return getSuppliers();
  });

  ipcMain.handle('purchase:saveSupplier', async (_event, supplierData: { supplier_id?: number; supplier_name: string; contact_phone?: string }) => {
    return saveSupplier(supplierData);
  });

  ipcMain.handle('purchase:getInvoices', async (_event, limit?: number) => {
    return getPurchaseInvoices(limit);
  });

  ipcMain.handle('purchase:getInvoiceItems', async (_event, invoiceId: number) => {
    return getPurchaseInvoiceItems(invoiceId);
  });

  // Phase 3 Shortages Handlers
  ipcMain.handle('shortage:getShortages', async (_event, supplierFilter?: number, searchQuery?: string) => {
    return getShortages(supplierFilter, searchQuery);
  });

  ipcMain.handle('shortage:addOrUpdate', async (_event, itemId: number, quantity: number, supplierId?: number) => {
    return addOrUpdateShortage(itemId, quantity, supplierId);
  });

  ipcMain.handle('shortage:remove', async (_event, shortageId: number) => {
    return removeShortage(shortageId);
  });

  ipcMain.handle('shortage:clearCompleted', async () => {
    return clearCompletedShortages();
  });

  // Phase 4 Treasury Handlers
  ipcMain.handle('treasury:getOverview', async () => {
    return getTreasuryOverview();
  });

  ipcMain.handle('treasury:recordTransaction', async (_event, payload: RecordTreasuryTransactionPayload) => {
    return recordTreasuryTransaction(payload);
  });

  // Phase 4 Shifts Handlers
  ipcMain.handle('shifts:getCurrent', async () => {
    return getCurrentShift();
  });

  ipcMain.handle('shifts:open', async (_event, userId: number, userName: string, openingBalance?: number) => {
    return openShift(userId, userName, openingBalance);
  });

  ipcMain.handle('shifts:close', async (_event, shiftId: number, actualCashCounted: number, notes?: string) => {
    return closeShift(shiftId, actualCashCounted, notes);
  });

  ipcMain.handle('shifts:getHistory', async (_event, limit?: number) => {
    return getShiftsHistory(limit);
  });

  // Phase 4 Customers & Delivery Handlers
  ipcMain.handle('cust:getWithBalances', async (_event, searchQuery?: string) => {
    return getCustomersWithBalances(searchQuery);
  });

  ipcMain.handle('cust:recordPayment', async (_event, customerId: number, amount: number, notes?: string) => {
    return recordCustomerPayment(customerId, amount, notes);
  });

  ipcMain.handle('delivery:getOrders', async (_event, statusFilter?: string, searchQuery?: string, limit?: number) => {
    return getDeliveryOrders(statusFilter, searchQuery, limit);
  });

  ipcMain.handle('delivery:updateStatus', async (_event, orderId: number, newStatus: string) => {
    return updateDeliveryStatus(orderId, newStatus);
  });

  // Phase 4 Reports & Analytics Handlers
  ipcMain.handle('reports:getFinancial', async (_event, startDate?: string, endDate?: string) => {
    return getFinancialReport(startDate, endDate);
  });

  ipcMain.handle('reports:getTopStagnant', async (_event, limit?: number) => {
    return getTopMovingAndStagnantItems(limit);
  });

  ipcMain.handle('reports:getValuation', async () => {
    return getExpiryAndStockValuationReport();
  });

  ipcMain.handle('reports:getAuditLogs', async (_event, limit?: number) => {
    return getUsersAndAuditLogs(limit);
  });

  // Backup Handlers
  ipcMain.handle('backup:perform', async () => {
    return await performBackup();
  });

  ipcMain.handle('backup:getStatus', async () => {
    return getCurrentBackupStatus();
  });

  // Relay backup status updates to renderer window
  onBackupStatusChanged((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backup:statusChanged', status);
    }
  });
}

app.whenReady().then(() => {
  // Initialize Database engine
  try {
    initDatabase();
    console.log('[Database] Initialized successfully with WAL mode and FTS5.');

    // Startup Accounting Ledger Integrity Check
    const ledgerStatus = checkLedgerIntegrity();
    if (!ledgerStatus.balanced) {
      if (Notification.isSupported()) {
        new Notification({
          title: 'تحذير مالي - عدم توازن ميزان المراجعة',
          body: `يوجد فارق في دفتر الأستاذ العام بمقدار ${ledgerStatus.diff.toFixed(2)} ج.م (المدين: ${ledgerStatus.total_debit.toFixed(2)} | الدائن: ${ledgerStatus.total_credit.toFixed(2)})`
        }).show();
      }
    }
  } catch (err) {
    console.error('[Database Init Error]', err);
  }

  // Register IPC handlers
  registerIpcHandlers();

  // Start USB watcher
  startUsbWatcher();

  // Create Window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
