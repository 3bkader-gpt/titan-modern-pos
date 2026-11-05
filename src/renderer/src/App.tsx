import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Navigation, NavTab } from './components/Navigation';
import { DashboardView } from './views/DashboardView';
import { CatalogInventoryView } from './views/CatalogInventoryView';
import { PosView } from './views/PosView';
import { PurchasesView } from './views/PurchasesView';
import { ShortagesView } from './views/ShortagesView';
import { TreasuryShiftsView } from './views/TreasuryShiftsView';
import { ReportsAnalyticsView } from './views/ReportsAnalyticsView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardStats, BackupStatus } from '../../shared/types';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('pos');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
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

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

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
  }, [loadStats, loadBackupStatus]);

  // Global Keyboard Navigation (F1, F3-F7 & Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['F1', 'F3', 'F4', 'F5', 'F6', 'F7'].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'F1':
          setActiveTab('pos');
          break;
        case 'F2':
          // F2 is dedicated to POS search: switch to POS if currently in another view
          if (activeTab !== 'pos') {
            e.preventDefault();
            setActiveTab('pos');
          }
          break;
        case 'F3':
          setActiveTab('purchases');
          break;
        case 'F4':
          setActiveTab('shortages');
          break;
        case 'F5':
          setActiveTab('treasury');
          break;
        case 'F6':
          setActiveTab('reports');
          break;
        case 'F7':
          setActiveTab('catalog');
          break;
        case 'Escape':
          setActiveTab('dashboard');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f1f5f9] text-slate-800 overflow-hidden font-sans select-none">
      {/* 1. Header Command Strip */}
      <Header
        stats={stats}
        backupStatus={backupStatus}
        onTriggerBackup={handleTriggerBackup}
        isBackingUp={isBackingUp}
      />

      {/* 2. Main Clinical Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Navigation activeTab={activeTab} onSelectTab={setActiveTab} />

        {/* Content Rail */}
        <main className="flex-1 overflow-y-auto p-4 bg-[#f1f5f9]">
          <div className="max-w-[1700px] mx-auto">
            {/* POS View is kept mounted so active invoices, cart tabs & focus are strictly preserved */}
            <div className={activeTab === 'pos' ? 'block' : 'hidden'}>
              <ErrorBoundary fallbackTab={() => setActiveTab('pos')}>
                <PosView />
              </ErrorBoundary>
            </div>

            <ErrorBoundary key={activeTab} fallbackTab={() => setActiveTab('pos')}>
              {activeTab === 'dashboard' && (
                <DashboardView stats={stats} loadingStats={loadingStats} />
              )}

              {activeTab === 'catalog' && <CatalogInventoryView />}

              {activeTab === 'purchases' && (
                <PurchasesView
                  initialDraftItems={pendingPurchaseDraft || undefined}
                  onClearInitialDraft={() => setPendingPurchaseDraft(null)}
                />
              )}

              {activeTab === 'shortages' && (
                <ShortagesView
                  onTransferToPurchases={handleTransferShortagesToPurchases}
                />
              )}

              {activeTab === 'treasury' && <TreasuryShiftsView />}

              {activeTab === 'reports' && <ReportsAnalyticsView />}
            </ErrorBoundary>
          </div>
        </main>
      </div>

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
