import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SalesInvoice, SalesInvoiceItem, AuthSession, EditableSaleInvoiceData, InvoiceRevisionEntry } from '../../../shared/types';
import {
  Receipt,
  Search,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Calendar,
  CreditCard,
  Package,
  RotateCcw,
  TrendingUp,
  Pencil,
  History,
  X
} from 'lucide-react';
import { QuickReturnModal } from '../components/pos/QuickReturnModal';
import { ManagerOverrideModal } from '../components/auth/ManagerOverrideModal';

type DateRangeFilter = 'today' | 'yesterday' | 'week' | 'all';

interface SalesInvoicesViewProps {
  currentUser?: AuthSession | null;
  onEditInvoice?: (data: EditableSaleInvoiceData, overridePin?: string) => void;
}

function getLocalDateStr(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const SalesInvoicesView: React.FC<SalesInvoicesViewProps> = ({ currentUser, onEditInvoice }) => {
  const isAdmin = !currentUser || currentUser.role === 'ADMIN';
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [selectedItems, setSelectedItems] = useState<SalesInvoiceItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);
  const [showReturnModal, setShowReturnModal] = useState<boolean>(false);
  const [editErrorMsg, setEditErrorMsg] = useState<string>('');
  const [pendingOverrideInvoiceNum, setPendingOverrideInvoiceNum] = useState<number | null>(null);
  const [revisionsModalNum, setRevisionsModalNum] = useState<number | null>(null);
  const [revisionsList, setRevisionsList] = useState<InvoiceRevisionEntry[]>([]);

  const proceedToLoadInvoiceForEdit = async (invoiceNumber: number, overridePin?: string) => {
    try {
      const editable = await window.electronAPI.getSaleInvoiceForEdit(invoiceNumber);
      if (!editable) {
        setEditErrorMsg('تعذر تحميل بيانات الفاتورة للتعديل.');
        return;
      }
      if (onEditInvoice) {
        onEditInvoice(editable, overridePin);
      }
    } catch (err: unknown) {
      setEditErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRequestEditInvoice = async () => {
    if (!selectedInvoice || !currentUser) return;
    setEditErrorMsg('');
    try {
      const check = await window.electronAPI.checkCanEditSaleInvoice(
        selectedInvoice.invoice_number,
        currentUser.user_id,
        currentUser.role
      );
      if (!check.can_edit) {
        setEditErrorMsg(check.reason || 'الفاتورة غير متاحة للتعديل.');
        return;
      }
      if (check.requires_manager_override) {
        setPendingOverrideInvoiceNum(selectedInvoice.invoice_number);
        return;
      }
      await proceedToLoadInvoiceForEdit(selectedInvoice.invoice_number);
    } catch (err: unknown) {
      setEditErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenRevisions = async (invoiceNumber: number) => {
    try {
      const list = await window.electronAPI.getInvoiceRevisions(invoiceNumber);
      setRevisionsList(list || []);
      setRevisionsModalNum(invoiceNumber);
    } catch {
      setRevisionsList([]);
    }
  };

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getRecentSalesInvoices(5000);
        setInvoices(data || []);
        if (data && data.length > 0) {
          setSelectedInvoice(prev => {
            if (!prev) return data[0];
            return data.find(i => i.invoice_number === prev.invoice_number) || data[0];
          });
        }
      }
    } catch (err) {
      console.error('Failed to load sales invoices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (!selectedInvoice) {
      setSelectedItems([]);
      return;
    }
    let cancelled = false;
    setLoadingItems(true);
    window.electronAPI
      ?.getSalesInvoiceItems(selectedInvoice.invoice_number)
      .then(items => {
        if (!cancelled) setSelectedItems(items || []);
      })
      .catch(() => {
        if (!cancelled) setSelectedItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedInvoice]);

  const filteredInvoices = useMemo(() => {
    const today = getLocalDateStr(0);
    const yesterday = getLocalDateStr(-1);
    const weekAgo = getLocalDateStr(-7);
    const q = searchQuery.trim().toLowerCase();

    return invoices.filter(inv => {
      if (dateFilter === 'today' && inv.invoice_date !== today) return false;
      if (dateFilter === 'yesterday' && inv.invoice_date !== yesterday) return false;
      if (dateFilter === 'week' && inv.invoice_date < weekAgo) return false;

      if (!q) return true;
      const numStr = String(inv.invoice_number);
      const dtStr = (inv.invoice_date || '').toLowerCase();
      const tmStr = (inv.invoice_time || '').toLowerCase();
      const client = (inv.client_name || '').toLowerCase();
      const pay = (inv.payment_method || '').toLowerCase();
      return (
        numStr.includes(q.replace(/^#/, '')) ||
        dtStr.includes(q) ||
        tmStr.includes(q) ||
        client.includes(q) ||
        pay.includes(q)
      );
    });
  }, [invoices, searchQuery, dateFilter]);

  const selectedIndex = useMemo(() => {
    if (!selectedInvoice) return -1;
    return filteredInvoices.findIndex(i => i.invoice_number === selectedInvoice.invoice_number);
  }, [filteredInvoices, selectedInvoice]);

  const goPrevInvoice = () => {
    // Previous = older invoice (next index in DESC list)
    if (filteredInvoices.length === 0) return;
    if (selectedIndex < 0) {
      setSelectedInvoice(filteredInvoices[0]);
    } else if (selectedIndex + 1 < filteredInvoices.length) {
      setSelectedInvoice(filteredInvoices[selectedIndex + 1]);
    }
  };

  const goNextInvoice = () => {
    // Next = newer invoice (previous index in DESC list)
    if (filteredInvoices.length === 0) return;
    if (selectedIndex > 0) {
      setSelectedInvoice(filteredInvoices[selectedIndex - 1]);
    }
  };

  const summary = useMemo(() => {
    let totalSales = 0;
    let totalProfit = 0;
    for (const inv of filteredInvoices) {
      totalSales += inv.total_selling_price || 0;
      totalProfit += inv.profit || 0;
    }
    return {
      count: filteredInvoices.length,
      totalSales,
      totalProfit
    };
  }, [filteredInvoices]);

  return (
    <div className="h-[calc(100vh-5.5rem)] flex flex-col gap-3 font-sans select-none">
      {/* Top Bar: Legacy-style < #N > navigator + Search + Date filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">سجل فواتير المبيعات</h2>
              <p className="text-[11px] text-slate-500">
                تصفح وبحث في كل الفواتير ({summary.count.toLocaleString('en-US')} فاتورة)
              </p>
            </div>
          </div>

          {/* Legacy-style quick invoice stepper (< #1989 >) */}
          <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1">
            <button
              type="button"
              onClick={goNextInvoice}
              disabled={selectedIndex <= 0}
              title="الفاتورة التالية (الأحدث)"
              className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="px-3 font-mono font-bold text-xs text-slate-900 min-w-[74px] text-center">
              {selectedInvoice ? `#${selectedInvoice.invoice_number}` : '—'}
            </div>
            <button
              type="button"
              onClick={goPrevInvoice}
              disabled={selectedIndex < 0 || selectedIndex >= filteredInvoices.length - 1}
              title="الفاتورة السابقة (الأقدم)"
              className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search + Quick Date Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث برقم الفاتورة أو التاريخ أو العميل..."
              className="w-60 pr-8 pl-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>

          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-[11px] font-bold">
            {(
              [
                ['today', 'اليوم'],
                ['yesterday', 'أمس'],
                ['week', '7 أيام'],
                ['all', 'الكل']
              ] as Array<[DateRangeFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDateFilter(key)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  dateFilter === key
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {selectedInvoice && onEditInvoice && (
            <button
              type="button"
              onClick={() => void handleRequestEditInvoice()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>تعديل الفاتورة (نفس اليوم)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowReturnModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>مرتجع فاتورة</span>
          </button>

          <button
            type="button"
            onClick={loadInvoices}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {editErrorMsg && (
        <div className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-between">
          <span>{editErrorMsg}</span>
          <button type="button" onClick={() => setEditErrorMsg('')} className="p-0.5 hover:bg-rose-100 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary Strip */}
      <div className={`grid gap-3 ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">عدد الفواتير</span>
          <span className="text-sm font-mono font-bold text-slate-900">
            {summary.count.toLocaleString('en-US')}
          </span>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">إجمالي المبيعات</span>
          <span className="text-sm font-mono font-bold text-blue-700">
            {summary.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
          </span>
        </div>
        {isAdmin && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>صافي الربح</span>
            </span>
            <span className="text-sm font-mono font-bold text-emerald-700">
              {summary.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </span>
          </div>
        )}
      </div>

      {/* Main Split View: Invoices List (Right) + Selected Invoice Details (Left) */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
        {/* Invoices Table */}
        <div className="col-span-12 lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
          <div className={`grid gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 ${
            isAdmin ? 'grid-cols-[72px_1fr_56px_88px_82px]' : 'grid-cols-[72px_1fr_56px_96px]'
          }`}>
            <div>الفاتورة</div>
            <div>التاريخ والوقت</div>
            <div className="text-center">أصناف</div>
            <div className="text-left">الإجمالي</div>
            {isAdmin && <div className="text-left">الربح</div>}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">جاري تحميل الفواتير...</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">لا توجد فواتير مطابقة للبحث</div>
            ) : (
              filteredInvoices.slice(0, 300).map(inv => {
                const isSelected = selectedInvoice?.invoice_number === inv.invoice_number;
                return (
                  <div
                    key={inv.invoice_number}
                    onClick={() => setSelectedInvoice(inv)}
                    className={`grid gap-2 px-3 py-2.5 text-xs items-center cursor-pointer transition-colors ${
                      isAdmin ? 'grid-cols-[72px_1fr_56px_88px_82px]' : 'grid-cols-[72px_1fr_56px_96px]'
                    } ${
                      isSelected
                        ? 'bg-blue-50 border-r-4 border-r-blue-600 text-blue-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-mono font-bold text-blue-700">#{inv.invoice_number}</div>
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] truncate">
                        {inv.invoice_time || inv.invoice_date}
                      </div>
                      {(inv.client_name || (inv.payment_method && inv.payment_method !== 'نقدي')) && (
                        <div className="text-[10px] text-slate-500 truncate">
                          {inv.payment_method || 'نقدي'}
                          {inv.client_name ? ` • ${inv.client_name}` : ''}
                        </div>
                      )}
                    </div>
                    <div className="text-center font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px]">
                        {inv.item_count}
                      </span>
                    </div>
                    <div className="text-left font-mono font-bold text-slate-900">
                      {(inv.total_selling_price || 0).toFixed(2)}
                    </div>
                    {isAdmin && (
                      <div className="text-left font-mono text-emerald-700">
                        +{(inv.profit || 0).toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {filteredInvoices.length > 300 && (
              <div className="p-2.5 text-center text-[11px] text-slate-400 bg-slate-50">
                يتم عرض أحدث 300 فاتورة — استخدم خانة البحث للوصول لأي فاتورة قديمة فوراً
              </div>
            )}
          </div>
        </div>

        {/* Selected Invoice Details */}
        <div className="col-span-12 lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
          {selectedInvoice ? (
            <>
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 font-mono">
                      فاتورة مبيعات #{selectedInvoice.invoice_number}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {selectedInvoice.payment_method || 'نقدي'}
                    </span>
                    {(selectedInvoice.edit_count || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleOpenRevisions(selectedInvoice.invoice_number)}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 cursor-pointer"
                        title="عرض سجل التعديلات"
                      >
                        <History className="w-3 h-3" />
                        <span>معدّلة ({selectedInvoice.edit_count})</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {selectedInvoice.invoice_time || selectedInvoice.invoice_date}
                    </span>
                    {selectedInvoice.client_name && (
                      <span className="flex items-center gap-1 font-sans">
                        <CreditCard className="w-3 h-3" />
                        {selectedInvoice.client_name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-left">
                  <div className="text-[11px] text-slate-500">الإجمالي</div>
                  <div className="text-base font-mono font-bold text-blue-700">
                    {(selectedInvoice.total_selling_price || 0).toFixed(2)} ج.م
                  </div>
                </div>
              </div>

              {/* Invoice Items List */}
              <div className="grid grid-cols-[32px_1fr_64px_68px_52px_74px] gap-2 px-4 py-2 bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-600">
                <div>#</div>
                <div>الصنف</div>
                <div className="text-center">الكمية</div>
                <div className="text-left">السعر</div>
                <div className="text-center">خصم%</div>
                <div className="text-left">الإجمالي</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {loadingItems ? (
                  <div className="p-8 text-center text-xs text-slate-400">جاري تحميل الأصناف...</div>
                ) : selectedItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    لا توجد أصناف مسجلة لهذه الفاتورة
                  </div>
                ) : (
                  selectedItems.map((it, idx) => (
                    <div
                      key={it.id || idx}
                      className="grid grid-cols-[32px_1fr_64px_68px_52px_74px] gap-2 px-4 py-2.5 text-xs items-center hover:bg-slate-50"
                    >
                      <div className="font-mono text-slate-400">{it.line_number || idx + 1}</div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate" title={it.item_name}>
                          {it.item_name}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span className="font-mono">كود: {it.item_id}</span>
                          {it.unit_type && <span>• {it.unit_type}</span>}
                          {it.returned_quantity && it.returned_quantity > 0 ? (
                            <span className="text-rose-600 font-bold">
                              (مرتجع: {it.returned_quantity})
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-center font-mono font-bold text-slate-800">
                        {it.quantity}
                      </div>
                      <div className="text-left font-mono text-slate-700">
                        {(it.unit_price || 0).toFixed(2)}
                      </div>
                      <div className="text-center font-mono text-slate-500">
                        {it.discount_pct || 0}%
                      </div>
                      <div className="text-left font-mono font-bold text-slate-900">
                        {(it.line_total || 0).toFixed(2)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer Totals */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-4 text-slate-600">
                  <span className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    عدد الأصناف: <strong className="font-mono text-slate-900">{selectedItems.length}</strong>
                  </span>
                  {isAdmin && (
                    <>
                      <span>
                        التكلفة: <strong className="font-mono text-slate-900">{(selectedInvoice.total_cost_price || 0).toFixed(2)}</strong>
                      </span>
                      <span>
                        الربح: <strong className="font-mono text-emerald-700">+{(selectedInvoice.profit || 0).toFixed(2)} ج.م</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              اختر فاتورة من القائمة لعرض تفاصيلها
            </div>
          )}
        </div>
      </div>

      {/* Quick Return Modal */}
      <QuickReturnModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        onSuccess={() => {
          setShowReturnModal(false);
          void loadInvoices();
          window.dispatchEvent(new Event('refresh-app-stats'));
        }}
      />

      {/* Manager Override Modal for editing another cashier's same-day invoice */}
      {currentUser && (
        <ManagerOverrideModal
          isOpen={pendingOverrideInvoiceNum !== null}
          currentUserId={currentUser.user_id}
          actionLabel="تعديل فاتورة موظف آخر (نفس اليوم)"
          targetRef={pendingOverrideInvoiceNum ? `#${pendingOverrideInvoiceNum}` : ''}
          onClose={() => setPendingOverrideInvoiceNum(null)}
          onAuthorized={({ pinCode }) => {
            const invNum = pendingOverrideInvoiceNum;
            setPendingOverrideInvoiceNum(null);
            if (invNum !== null) {
              void proceedToLoadInvoiceForEdit(invNum, pinCode);
            }
          }}
        />
      )}

      {/* Revisions History Modal */}
      {revisionsModalNum !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          data-modal-open="true"
          dir="rtl"
        >
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                سجل تعديلات الفاتورة #{revisionsModalNum}
              </h3>
              <button
                type="button"
                onClick={() => setRevisionsModalNum(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto space-y-2 text-xs">
              {revisionsList.length === 0 ? (
                <div className="text-center text-slate-400 py-6">لا توجد تعديلات مسجلة</div>
              ) : (
                revisionsList.map((rev) => (
                  <div key={rev.revision_id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        تعديل #{rev.revision_number} — {rev.edited_by_user_name}
                        {rev.authorized_by_name ? ` (بتفويض: ${rev.authorized_by_name})` : ''}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">{rev.created_at}</span>
                    </div>
                    <div className="font-mono text-slate-700">
                      من: {rev.old_total.toFixed(2)} ج.م ({rev.old_payment_method}) ← إلى: {rev.new_total.toFixed(2)} ج.م ({rev.new_payment_method})
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
