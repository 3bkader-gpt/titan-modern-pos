import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Navigation, NavTab } from './components/Navigation';
import { DashboardView } from './views/DashboardView';
import { CatalogInventoryView } from './views/CatalogInventoryView';
import { PosView } from './views/PosView';
import { SalesInvoicesView } from './views/SalesInvoicesView';
import { PurchasesView } from './views/PurchasesView';
import { ShortagesView } from './views/ShortagesView';
import { TreasuryShiftsView } from './views/TreasuryShiftsView';
import { ReportsAnalyticsView } from './views/ReportsAnalyticsView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DataLocationModal } from './components/DataLocationModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { DashboardStats, BackupStatus, StorageInfo, AuthSession, EditableSaleInvoiceData } from '../../shared/types';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

const AUTH_SESSION_STORAGE_KEY = 'titan_auth_session';

function loadStoredAuthSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed && typeof parsed.user_id === 'number' && parsed.role ? parsed : null;
  } catch {
    return null;
  }
}

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthSession | null>(() => loadStoredAuthSession());
  const [showSwitchUserModal, setShowSwitchUserModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<NavTab>('pos');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState<boolean>(false);
  const [isFirstRunStorageSetup, setIsFirstRunStorageSetup] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Cross-screen draft bridge (from F4 Shortages to F3 Purchases)
  const [pendingPurchaseDraft, setPendingPurchaseDraft] = useState<Array<{
    item_id: number;
    item_name_en: string;
    item_name_ar?: string;
    quantity: number;
    consumer_price: number;
    buy_price: number;
    discount_pct?: number;
    expiry_date?: string;
  }> | null>(null);
  const [pendingEditInvoice, setPendingEditInvoice] = useState<{
    data: EditableSaleInvoiceData;
    overridePin?: string;
  } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  const canAccessTab = useCallback((tab: NavTab, session: AuthSession | null = currentUser): boolean => {
    if (!session) return false;
    if (session.role === 'ADMIN') return true;
    return session.allowed_tabs.includes(tab);
  }, [currentUser]);

  const navigateToTab = useCallback((tab: NavTab) => {
    if (!canAccessTab(tab, currentUser)) {
      showToast('هذه الشاشة غير متاحة لصلاحيتك الحالية.', 'error');
      return;
    }
    setActiveTab(tab);
  }, [canAccessTab, currentUser, showToast]);

  const handleLoginSuccess = useCallback((session: AuthSession) => {
    try {
      sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage quota errors
    }
    setCurrentUser(session);
    setShowSwitchUserModal(false);
    setActiveTab((prev) => {
      if (session.role === 'ADMIN' || session.allowed_tabs.includes(prev)) {
        return prev;
      }
      return (session.allowed_tabs[0] as NavTab) || 'pos';
    });
    showToast(`مرحباً ${session.user_name}`, 'success');
  }, [showToast]);

  const loadStats = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getDashboardStats();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadBackupStatus = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const status = await window.electronAPI.getBackupStatus();
        setBackupStatus(status);
      }
    } catch (err) {
      console.error('Failed to get backup status:', err);
    }
  }, []);

  const loadStorageInfo = useCallback(async (openIfUnconfigured: boolean = false) => {
    try {
      if (window.electronAPI?.getStorageInfo) {
        const info = await window.electronAPI.getStorageInfo();
        setStorageInfo(info);
        if (openIfUnconfigured && !info.isCustomConfigured) {
          setIsFirstRunStorageSetup(true);
          setIsStorageModalOpen(true);
        }
      }
    } catch (err) {
      console.error('Failed to load storage info:', err);
    }
  }, []);

  const handleStorageUpdated = async (updatedInfo: StorageInfo, message?: string) => {
    setStorageInfo(updatedInfo);
    setIsFirstRunStorageSetup(false);
    await loadStats();
    await loadBackupStatus();
    window.dispatchEvent(new Event('refresh-app-stats'));
    if (message) {
      showToast(message, 'success');
    }
  };

  const handleTriggerBackup = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    showToast('جاري تنفيذ النسخ الاحتياطي اللحظي في الخلفية...', 'info');

    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.performBackup();
        setBackupStatus(res);
        if (res.status === 'ERROR') {
          showToast(res.message || 'فشل النسخ الاحتياطي', 'error');
        } else {
          showToast(res.message || 'تم إتمام النسخ الاحتياطي بنجاح', 'success');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`خطأ في النسخ: ${msg}`, 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleTransferShortagesToPurchases = (selectedItems: Array<{
    item_id: number;
    item_name_en: string;
    item_name_ar?: string;
    quantity: number;
    consumer_price: number;
    buy_price: number;
    discount_pct?: number;
    expiry_date?: string;
  }>) => {
    setPendingPurchaseDraft(selectedItems);
    setActiveTab('purchases');
    showToast(
      `تم تحويل ${selectedItems.length} صنفاً بنجاح إلى مسودة فاتورة مشتريات (F3)`,
      'success'
    );
  };

  useEffect(() => {
    loadStats();
    loadBackupStatus();
    loadStorageInfo(true);

    let unsubscribe: (() => void) | undefined;
    if (window.electronAPI?.onBackupStatusChange) {
      unsubscribe = window.electronAPI.onBackupStatusChange((newStatus) => {
        setBackupStatus(newStatus);
      });
    }

    window.addEventListener('refresh-app-stats', loadStats);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('refresh-app-stats', loadStats);
    };
  }, [loadStats, loadBackupStatus, loadStorageInfo]);

  // Global Keyboard Navigation (F1, F3-F7, Ctrl+L & Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.code === 'KeyL' || e.key.toLowerCase() === 'l')) {
        e.preventDefault();
        setShowSwitchUserModal(true);
        return;
      }

      if (!currentUser || showSwitchUserModal) {
        return;
      }

      if (['F1', 'F3', 'F4', 'F5', 'F6', 'F7', 'F12'].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'F1':
          navigateToTab('pos');
          break;
        case 'F2':
          if (activeTab !== 'pos' && canAccessTab('pos', currentUser)) {
            e.preventDefault();
            navigateToTab('pos');
          }
          break;
        case 'F3':
          navigateToTab('purchases');
          break;
        case 'F4':
          navigateToTab('shortages');
          break;
        case 'F5':
          navigateToTab('treasury');
          break;
        case 'F6':
          navigateToTab('reports');
          break;
        case 'F7':
          navigateToTab('catalog');
          break;
        case 'F12':
          navigateToTab('sales_invoices');
          break;
        case 'Escape': {
          if (e.defaultPrevented) break;
          if (document.querySelector('[data-modal-open="true"]') || document.querySelector('.fixed.inset-0.z-50')) break;
          const target = e.target as HTMLElement | null;
          if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) break;
          if (activeTab !== 'pos' && activeTab !== 'dashboard') {
            navigateToTab('pos');
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, currentUser, showSwitchUserModal, canAccessTab, navigateToTab]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f1f5f9] text-slate-800 overflow-hidden font-sans select-none">
      {/* 1. Header Command Strip */}
      <Header
        stats={stats}
        backupStatus={backupStatus}
        storageInfo={storageInfo}
        currentUser={currentUser}
        onTriggerBackup={handleTriggerBackup}
        onOpenStorageModal={() => {
          setIsFirstRunStorageSetup(false);
          void loadStorageInfo(false);
          setIsStorageModalOpen(true);
        }}
        onSwitchUser={() => setShowSwitchUserModal(true)}
        isBackingUp={isBackingUp}
      />

      {/* 2. Main Clinical Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Navigation activeTab={activeTab} onSelectTab={navigateToTab} currentUser={currentUser} />

        {/* Content Rail */}
        <main className="flex-1 overflow-y-auto p-4 bg-[#f1f5f9]">
          <div className="max-w-[1700px] mx-auto">
            {/* POS View is kept mounted so active invoices, cart tabs & focus are strictly preserved */}
            <div className={activeTab === 'pos' ? 'block' : 'hidden'}>
              <ErrorBoundary fallbackTab={() => navigateToTab('pos')}>
                <PosView
                  currentUser={currentUser}
                  pendingEditInvoice={pendingEditInvoice}
                  onClearPendingEditInvoice={() => setPendingEditInvoice(null)}
                />
              </ErrorBoundary>
            </div>

            <ErrorBoundary key={activeTab} fallbackTab={() => navigateToTab('pos')}>
              {activeTab === 'dashboard' && canAccessTab('dashboard', currentUser) && (
                <DashboardView stats={stats} loadingStats={loadingStats} />
              )}

              {activeTab === 'sales_invoices' && (
                <SalesInvoicesView
                  currentUser={currentUser}
                  onEditInvoice={(data, overridePin) => {
                    setPendingEditInvoice({ data, overridePin });
                    navigateToTab('pos');
                  }}
                />
              )}

              {activeTab === 'catalog' && canAccessTab('catalog', currentUser) && <CatalogInventoryView />}

              {activeTab === 'purchases' && canAccessTab('purchases', currentUser) && (
                <PurchasesView
                  currentUser={currentUser}
                  initialDraftItems={pendingPurchaseDraft || undefined}
                  onClearInitialDraft={() => setPendingPurchaseDraft(null)}
                />
              )}

              {activeTab === 'shortages' && (
                <ShortagesView
                  onTransferToPurchases={handleTransferShortagesToPurchases}
                />
              )}

              {activeTab === 'treasury' && canAccessTab('treasury', currentUser) && <TreasuryShiftsView />}

              {activeTab === 'reports' && canAccessTab('reports', currentUser) && <ReportsAnalyticsView />}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* RBAC Login / User Switch Modal */}
      {(!currentUser || showSwitchUserModal) && (
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          canCancel={!!currentUser}
          onCancelSwitch={() => setShowSwitchUserModal(false)}
        />
      )}

      {/* Data Storage Location Modal */}
      <DataLocationModal
        isOpen={isStorageModalOpen}
        isFirstRunSetup={isFirstRunStorageSetup}
        storageInfo={storageInfo}
        onClose={() => setIsStorageModalOpen(false)}
        onUpdated={handleStorageUpdated}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 left-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className={`px-4 py-2.5 rounded-lg shadow-lg border flex items-center gap-2.5 text-xs font-sans ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : toast.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-white text-slate-800 border-slate-200 shadow-md'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span className="font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
