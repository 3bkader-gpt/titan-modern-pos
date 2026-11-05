import React, { useState, useEffect, useCallback } from 'react';
import { 
  TreasuryOverview, 
  LedgerEntry, 
  WorkShift, 
  Customer, 
  DeliveryOrder, 
  Supplier,
  RecordTreasuryTransactionPayload 
} from '../../../shared/types';
import { 
  Landmark, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  Truck, 
  FileText, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  X, 
  Check, 
  Printer, 
  ShieldAlert, 
  Phone, 
  MapPin,
  Calendar,
  Wallet
} from 'lucide-react';

export const TreasuryShiftsView: React.FC = () => {
  // Main Subtabs: Treasury & Ledger | Shifts Handover | Customers & Delivery
  const [subTab, setSubTab] = useState<'treasury' | 'shifts' | 'customers_delivery'>('treasury');

  // 1. Treasury State
  const [treasury, setTreasury] = useState<TreasuryOverview | null>(null);
  const [loadingTreasury, setLoadingTreasury] = useState<boolean>(true);
  const [isAddTxOpen, setIsAddTxOpen] = useState<boolean>(false);
  const [txType, setTxType] = useState<'EXPENSE' | 'DEPOSIT' | 'WITHDRAWAL' | 'SUPPLIER_PAYMENT'>('EXPENSE');
  const [txCategory, setTxCategory] = useState<string>('كهرباء');
  const [txAmount, setTxAmount] = useState<number | ''>('');
  const [txNotes, setTxNotes] = useState<string>('');
  const [txSupplierId, setTxSupplierId] = useState<number | ''>('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [savingTx, setSavingTx] = useState<boolean>(false);

  // 2. Shifts State
  const [currentShift, setCurrentShift] = useState<WorkShift | null>(null);
  const [shiftsHistory, setShiftsHistory] = useState<WorkShift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState<boolean>(false);
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState<boolean>(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState<boolean>(false);
  const [newShiftUserName, setNewShiftUserName] = useState<string>('د. مريم الحميلي');
  const [newShiftOpeningBalance, setNewShiftOpeningBalance] = useState<number | ''>('');
  const [closeActualCash, setCloseActualCash] = useState<number | ''>('');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [savingShift, setSavingShift] = useState<boolean>(false);

  // 3. Customers & Delivery State
  const [custDeliverySub, setCustDeliverySub] = useState<'customers' | 'delivery'>('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState<boolean>(false);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [loadingDelivery, setLoadingDelivery] = useState<boolean>(false);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>('ALL');
  const [deliverySearch, setDeliverySearch] = useState<string>('');

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load Treasury
  const loadTreasuryData = useCallback(async () => {
    setLoadingTreasury(true);
    try {
      if (window.electronAPI) {
        const [tData, sData] = await Promise.all([
          window.electronAPI.getTreasuryOverview(),
          window.electronAPI.getSuppliers()
        ]);
        setTreasury(tData);
        setSuppliers(sData || []);
        if (tData && newShiftOpeningBalance === '') {
          setNewShiftOpeningBalance(tData.cash_balance);
        }
      }
    } catch (err) {
      console.error('Failed to load treasury data:', err);
    } finally {
      setLoadingTreasury(false);
    }
  }, [newShiftOpeningBalance]);

  // Load Shifts
  const loadShiftsData = useCallback(async () => {
    setLoadingShifts(true);
    try {
      if (window.electronAPI) {
        const [active, history] = await Promise.all([
          window.electronAPI.getCurrentShift(),
          window.electronAPI.getShiftsHistory(20)
        ]);
        setCurrentShift(active);
        setShiftsHistory(history || []);
      }
    } catch (err) {
      console.error('Failed to load shifts data:', err);
    } finally {
      setLoadingShifts(false);
    }
  }, []);

  // Load Customers
  const loadCustomersData = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getCustomersWithBalances(customerSearch);
        setCustomers(data || []);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoadingCustomers(false);
    }
  }, [customerSearch]);

  // Load Delivery
  const loadDeliveryData = useCallback(async () => {
    setLoadingDelivery(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getDeliveryOrders(
          deliveryStatusFilter,
          deliverySearch,
          40
        );
        setDeliveryOrders(data || []);
      }
    } catch (err) {
      console.error('Failed to load delivery orders:', err);
    } finally {
      setLoadingDelivery(false);
    }
  }, [deliveryStatusFilter, deliverySearch]);

  useEffect(() => {
    loadTreasuryData();
    loadShiftsData();
  }, [loadTreasuryData, loadShiftsData]);

  useEffect(() => {
    if (subTab === 'customers_delivery') {
      if (custDeliverySub === 'customers') loadCustomersData();
      else loadDeliveryData();
    }
  }, [subTab, custDeliverySub, loadCustomersData, loadDeliveryData]);

  // Handle Save Treasury Transaction
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || Number(txAmount) <= 0) return;

    setSavingTx(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.recordTreasuryTransaction({
          type: txType,
          category: txCategory,
          amount: Number(txAmount),
          notes: txNotes.trim() || undefined,
          supplier_id: txType === 'SUPPLIER_PAYMENT' && txSupplierId !== '' ? Number(txSupplierId) : undefined
        });

        await loadTreasuryData();
        setIsAddTxOpen(false);
        setTxAmount('');
        setTxNotes('');
        setStatusMessage({
          text: `تم تسجيل الحركة بنجاح (القيد #${res.entry_id}). رصيد الخزينة الحالي: ${res.new_balance.toFixed(2)} ج.م`,
          type: 'success'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: `خطأ في تسجيل الحركة: ${msg}`, type: 'error' });
    } finally {
      setSavingTx(false);
    }
  };

  // Handle Open Shift
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingShift(true);
    try {
      if (window.electronAPI) {
        const shift = await window.electronAPI.openShift(
          1,
          newShiftUserName.trim() || 'الصيدلي المناوب',
          newShiftOpeningBalance !== '' ? Number(newShiftOpeningBalance) : undefined
        );
        setCurrentShift(shift);
        await loadShiftsData();
        setIsOpenShiftModalOpen(false);
        setStatusMessage({
          text: `تم فتح الوردية #${shift.shift_id} بنجاح برصيد افتتاحي ${shift.opening_balance.toFixed(2)} ج.م`,
          type: 'success'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: `فشل فتح الوردية: ${msg}`, type: 'error' });
    } finally {
      setSavingShift(false);
    }
  };

  // Handle Close Shift
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShift || closeActualCash === '') return;

    setSavingShift(true);
    try {
      if (window.electronAPI) {
        const closed = await window.electronAPI.closeShift(
          currentShift.shift_id,
          Number(closeActualCash),
          closeNotes.trim() || undefined
        );
        setCurrentShift(null);
        await loadShiftsData();
        setIsCloseShiftModalOpen(false);
        setCloseActualCash('');
        setCloseNotes('');

        const disc = closed.discrepancy || 0;
        const discText = disc === 0 
          ? 'النقدية متطابقة تماماً (بدون عجز أو زيادة) ✔' 
          : disc > 0 
          ? `يوجد زيادة بالدرج: +${disc.toFixed(2)} ج.م` 
          : `يوجد عجز بالدرج: ${disc.toFixed(2)} ج.م ⚠`;

        setStatusMessage({
          text: `تم تقفيل الوردية #${closed.shift_id} بنجاح. ${discText}`,
          type: 'success'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: `فشل تقفيل الوردية: ${msg}`, type: 'error' });
    } finally {
      setSavingShift(false);
    }
  };

  // Handle Record Customer Debt Payment
  const handleSaveCustomerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForPayment || !paymentAmount || Number(paymentAmount) <= 0) return;

    setSavingPayment(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.recordCustomerPayment(
          selectedCustomerForPayment.customer_id,
          Number(paymentAmount),
          paymentNotes.trim() || undefined
        );
        await Promise.all([loadCustomersData(), loadTreasuryData()]);
        setSelectedCustomerForPayment(null);
        setPaymentAmount('');
        setPaymentNotes('');
        setStatusMessage({
          text: `تم تحصيل مبلغ ${Number(paymentAmount).toFixed(2)} ج.م من العميل بنجاح. رصيد العميل المتبقي: ${res.new_customer_balance.toFixed(2)} ج.م`,
          type: 'success'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: `خطأ في تحصيل الدفعة: ${msg}`, type: 'error' });
    } finally {
      setSavingPayment(false);
    }
  };

  // Handle Update Delivery Order Status
  const handleUpdateDeliveryStatus = async (orderId: number, status: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.updateDeliveryStatus(orderId, status);
        setDeliveryOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, status } : o));
      }
    } catch (err) {
      console.error('Error updating delivery status:', err);
    }
  };

  return (
    <div className="space-y-3 font-sans pb-8 select-none">
      {/* 1. Top Header Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  إدارة الخزينة والورديات والعملاء والدليفري
                </h1>
                <kbd className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-300">
                  F5
                </kbd>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                الرصيد الفعلي للخزينة، القيود المحاسبية، تقفيل ورديات الكاشير، وحسابات الآجل والدليفري.
              </p>
            </div>
          </div>

          {/* Subtabs Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setSubTab('treasury')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                subTab === 'treasury'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>الخزينة واليومية العامة</span>
            </button>

            <button
              onClick={() => setSubTab('shifts')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                subTab === 'shifts'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>إدارة وتقفيل الورديات</span>
              {currentShift && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setSubTab('customers_delivery')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                subTab === 'customers_delivery'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>حسابات العملاء والدليفري</span>
            </button>
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-all ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. SUBTAB: TREASURY & GENERAL LEDGER                     */}
      {/* ======================================================== */}
      {subTab === 'treasury' && (
        <div className="space-y-3">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Live Cash Balance */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">رصيد الخزينة الفعلي الحـي</span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Landmark className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold font-mono text-slate-900">
                  {treasury?.cash_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '119,242.50'}
                </span>
                <span className="text-xs font-bold text-slate-500 font-sans">ج.م</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>الخزينة الرئيسية</span>
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  محدث لحظياً
                </span>
              </div>
            </div>

            {/* Today Inflow */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">مقبوضات اليوم (وارد)</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold font-mono text-emerald-600">
                  +{treasury?.today_inflow.toFixed(2) || '0.00'}
                </span>
                <span className="text-xs font-bold text-slate-500 font-sans">ج.م</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                مبيعات نقدية + إيداعات وتحصيلات
              </div>
            </div>

            {/* Today Outflow */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">مدفوعات اليوم (منصرف)</span>
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold font-mono text-rose-600">
                  -{treasury?.today_outflow.toFixed(2) || '0.00'}
                </span>
                <span className="text-xs font-bold text-slate-500 font-sans">ج.م</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                مصروفات + توريدات مشتريات نقدية
              </div>
            </div>

            {/* Action Card: Record Transaction */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 shadow-2xs text-white flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-blue-100">تسجيل حركة نقدية</span>
                <p className="text-xs text-blue-100/80 mt-1 leading-relaxed">
                  تسجيل مصروفات، إيداع، سحب مالك، أو سداد مورد مع إنشاء قيد آلي.
                </p>
              </div>
              <button
                onClick={() => setIsAddTxOpen(true)}
                className="mt-3 w-full py-2 bg-white hover:bg-blue-50 text-blue-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل حركة خزينة جديدة</span>
              </button>
            </div>
          </div>

          {/* General Ledger Table */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">
                  دفتر الأستاذ العام والقيود المحاسبية (`general_ledger_2026`)
                </span>
              </div>
              <button
                onClick={loadTreasuryData}
                disabled={loadingTreasury}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTreasury ? 'animate-spin' : ''}`} />
                <span>تحديث القيود</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-3 w-16 text-center">القيد #</th>
                    <th className="py-2.5 px-3 w-24 text-center">التاريخ</th>
                    <th className="py-2.5 px-3 min-w-[200px]">الحساب المحاسبي</th>
                    <th className="py-2.5 px-3 w-32">المستند</th>
                    <th className="py-2.5 px-3 min-w-[220px]">البيان / الملاحظات</th>
                    <th className="py-2.5 px-3 w-28 text-left text-emerald-700">مدين (Debit)</th>
                    <th className="py-2.5 px-3 w-28 text-left text-rose-700">دائن (Credit)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingTreasury ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
                        <span>جاري تحميل دفتر الأستاذ...</span>
                      </td>
                    </tr>
                  ) : !treasury || treasury.recent_entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        لا توجد قيود مسجلة
                      </td>
                    </tr>
                  ) : (
                    treasury.recent_entries.map((entry) => (
                      <tr key={entry.entry_id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                          #{entry.entry_id}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-600">
                          {entry.entry_date}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {entry.account_name}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                          {entry.document_ref || '-'}
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-sans">
                          {entry.notes || '-'}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-emerald-700">
                          {entry.debit > 0 ? `${entry.debit.toFixed(2)} ج.م` : '-'}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-rose-700">
                          {entry.credit > 0 ? `${entry.credit.toFixed(2)} ج.م` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. SUBTAB: WORK SHIFTS                                    */}
      {/* ======================================================== */}
      {subTab === 'shifts' && (
        <div className="space-y-3">
          {/* Active Shift Card or Open New Shift Banner */}
          {currentShift ? (
            <div className="bg-white rounded-xl border-2 border-emerald-500/40 p-4 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                        وردية مفتوحة حالياً (#{currentShift.shift_id})
                      </span>
                      <span className="font-bold text-slate-900 text-sm">
                        {currentShift.user_name}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                      بدء الوردية: {currentShift.start_time}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCloseActualCash(
                      currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount
                    );
                    setIsCloseShiftModalOpen(true);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors self-end sm:self-auto"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تقفيل الوردية وتسليم الدرج (Z-Report)</span>
                </button>
              </div>

              {/* Shift Key Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-500 block text-[11px]">الرصيد الافتتاحي:</span>
                  <strong className="font-mono text-sm text-slate-800">
                    {currentShift.opening_balance.toFixed(2)} ج.م
                  </strong>
                </div>

                <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                  <span className="text-blue-700 block text-[11px]">إجمالي المبيعات:</span>
                  <strong className="font-mono text-sm text-blue-800">
                    {currentShift.total_sales.toFixed(2)} ج.م
                  </strong>
                </div>

                <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-emerald-700 block text-[11px]">مبيعات كاش (نقدية):</span>
                  <strong className="font-mono text-sm text-emerald-800">
                    {currentShift.cash_sales.toFixed(2)} ج.م
                  </strong>
                </div>

                <div className="bg-purple-50/60 p-2.5 rounded-lg border border-purple-100">
                  <span className="text-purple-700 block text-[11px]">مبيعات فيزا:</span>
                  <strong className="font-mono text-sm text-purple-800">
                    {currentShift.card_sales.toFixed(2)} ج.م
                  </strong>
                </div>

                <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-100">
                  <span className="text-amber-700 block text-[11px]">المرتجع والمصروف:</span>
                  <strong className="font-mono text-sm text-amber-800">
                    -{(currentShift.returns_amount + currentShift.expenses_amount).toFixed(2)} ج.م
                  </strong>
                </div>

                <div className="bg-blue-600 text-white p-2.5 rounded-lg shadow-2xs">
                  <span className="text-blue-100 block text-[11px]">النقدية المتوقعة بالدرج:</span>
                  <strong className="font-mono text-sm font-extrabold">
                    {(currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount).toFixed(2)} ج.م
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/90 p-8 shadow-2xs text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">
                لا توجد وردية مفتوحة حالياً
              </h3>
              <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed">
                افتح وردية جديدة لبدء تسجيل مبيعات الكاشير وحركات الدرج والمطابقة المحاسبية عند التقفيل.
              </p>
              <button
                onClick={() => setIsOpenShiftModalOpen(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>فتح وردية جديدة الآن</span>
              </button>
            </div>
          )}

          {/* Shifts History Table */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-xs font-bold text-slate-800">
                سجل الورديات السابقة وتقارير التقفيل ({shiftsHistory.length})
              </span>
              <button
                onClick={loadShiftsData}
                disabled={loadingShifts}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingShifts ? 'animate-spin' : ''}`} />
                <span>تحديث السجل</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-3 w-16 text-center">الوردية #</th>
                    <th className="py-2.5 px-3 min-w-[140px]">الصيدلي المناوب</th>
                    <th className="py-2.5 px-3 w-32 text-center">وقت البداية</th>
                    <th className="py-2.5 px-3 w-32 text-center">وقت التقفيل</th>
                    <th className="py-2.5 px-3 w-24 text-left">المبيعات</th>
                    <th className="py-2.5 px-3 w-28 text-left">النقدية الفعلية</th>
                    <th className="py-2.5 px-3 w-28 text-center">العجز / الزيادة</th>
                    <th className="py-2.5 px-3 w-20 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shiftsHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        لا توجد ورديات سابقة مسجلة
                      </td>
                    </tr>
                  ) : (
                    shiftsHistory.map((shift) => (
                      <tr key={shift.shift_id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center font-mono font-bold text-blue-700">
                          #{shift.shift_id}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {shift.user_name}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-600">
                          {shift.start_time}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-600">
                          {shift.end_time || '-'}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-slate-800">
                          {shift.total_sales.toFixed(2)} ج.م
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                          {shift.actual_cash_counted != null ? `${shift.actual_cash_counted.toFixed(2)} ج.م` : '-'}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold">
                          {shift.discrepancy == null ? (
                            <span className="text-slate-400">-</span>
                          ) : shift.discrepancy === 0 ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">متطابق</span>
                          ) : shift.discrepancy > 0 ? (
                            <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded">+{shift.discrepancy.toFixed(2)}</span>
                          ) : (
                            <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded">{shift.discrepancy.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            shift.status === 'OPEN'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {shift.status === 'OPEN' ? 'مفتوحة' : 'مغلقة'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. SUBTAB: CUSTOMERS & DELIVERY                           */}
      {/* ======================================================== */}
      {subTab === 'customers_delivery' && (
        <div className="space-y-3">
          {/* Sub Switcher: Customers / Delivery */}
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200/90 p-2 shadow-2xs">
            <button
              onClick={() => setCustDeliverySub('customers')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                custDeliverySub === 'customers'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              دليل وحسابات العملاء الآجل
            </button>
            <button
              onClick={() => setCustDeliverySub('delivery')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                custDeliverySub === 'delivery'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              طلبات الدليفري والتوصيل (751+)
            </button>
          </div>

          {/* Customers View */}
          {custDeliverySub === 'customers' && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-3.5 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50/60">
                <span className="text-xs font-bold text-slate-800">
                  قائمة العملاء وأرصدة المديونيات
                </span>
                <div className="relative min-w-[260px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="ابحث باسم العميل أو رقم الهاتف..."
                    className="w-full pr-8 pl-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3 w-16 text-center">كود</th>
                      <th className="py-2.5 px-3 min-w-[180px]">اسم العميل</th>
                      <th className="py-2.5 px-3 w-32">الهاتف</th>
                      <th className="py-2.5 px-3 min-w-[200px]">العنوان</th>
                      <th className="py-2.5 px-3 w-32 text-left">رصيد الحساب</th>
                      <th className="py-2.5 px-3 w-28 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400">
                          لا يوجد عملاء مطابقين للبحث
                        </td>
                      </tr>
                    ) : (
                      customers.map((c) => (
                        <tr key={c.customer_id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                            #{c.customer_id}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">
                            {c.customer_name}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600">
                            {c.phone || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {c.address || '-'}
                          </td>
                          <td className="py-2 px-3 text-left font-mono font-bold">
                            <span className={c.account_balance > 0 ? 'text-rose-600' : 'text-slate-800'}>
                              {c.account_balance.toFixed(2)} ج.م
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => {
                                setSelectedCustomerForPayment(c);
                                setPaymentAmount(c.account_balance > 0 ? c.account_balance : '');
                              }}
                              className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] transition-colors"
                            >
                              تحصيل دفعة
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Delivery Orders View */}
          {custDeliverySub === 'delivery' && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-3.5 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">تصفية الحالة:</span>
                  <select
                    value={deliveryStatusFilter}
                    onChange={(e) => setDeliveryStatusFilter(e.target.value)}
                    className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none"
                  >
                    <option value="ALL">جميع الحالات</option>
                    <option value="Delivered">تم التسليم (Delivered)</option>
                    <option value="Out for Delivery">قيد التوصيل</option>
                    <option value="Pending">معلق (Pending)</option>
                    <option value="Cancelled">ملغي</option>
                  </select>
                </div>

                <div className="relative min-w-[260px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={deliverySearch}
                    onChange={(e) => setDeliverySearch(e.target.value)}
                    placeholder="ابحث بالصنف أو العميل..."
                    className="w-full pr-8 pl-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3 w-16 text-center">الطلب #</th>
                      <th className="py-2.5 px-3 w-32 text-center">وقت الطلب</th>
                      <th className="py-2.5 px-3 min-w-[200px]">الصنف المطلوب</th>
                      <th className="py-2.5 px-3 min-w-[140px]">اسم العميل / الهاتف</th>
                      <th className="py-2.5 px-3 w-28 text-center">الحالة الحالية</th>
                      <th className="py-2.5 px-3 w-36 text-center">تغيير الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deliveryOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400">
                          لا توجد طلبات دليفري مسجلة
                        </td>
                      </tr>
                    ) : (
                      deliveryOrders.map((order) => (
                        <tr key={order.order_id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                            #{order.order_id}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-600">
                            {order.order_timestamp}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">
                            {order.item_ordered || 'طلب دواء عام'}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {order.customer_name || 'عميل دليفري'} {order.phone ? `(${order.phone})` : ''}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              order.status === 'Delivered'
                                ? 'bg-emerald-100 text-emerald-800'
                                : order.status === 'Out for Delivery'
                                ? 'bg-blue-100 text-blue-800'
                                : order.status === 'Cancelled'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {order.status === 'Delivered' ? 'تم التسليم' : order.status === 'Out for Delivery' ? 'في الطريق' : order.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <select
                              value={order.status}
                              onChange={(e) => handleUpdateDeliveryStatus(order.order_id, e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700 focus:outline-none"
                            >
                              <option value="Delivered">تم التسليم</option>
                              <option value="Out for Delivery">قيد التوصيل</option>
                              <option value="Pending">معلق</option>
                              <option value="Cancelled">ملغي</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODALS: ADD TRANSACTION / OPEN SHIFT / CLOSE SHIFT       */}
      {/* ======================================================== */}

      {/* 1. Add Treasury Transaction Modal */}
      {isAddTxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
          <form
            onSubmit={handleSaveTransaction}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="w-4 h-4 text-blue-600" />
                <span>تسجيل حركة نقدية بالخزينة</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddTxOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 text-xs">
              {/* Transaction Type */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">نوع الحركة</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTxType('EXPENSE')}
                    className={`py-1.5 rounded-lg font-bold border transition-all text-center ${
                      txType === 'EXPENSE'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    مصروفات تشغيلية
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('DEPOSIT')}
                    className={`py-1.5 rounded-lg font-bold border transition-all text-center ${
                      txType === 'DEPOSIT'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    إيداع بالخزينة
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('WITHDRAWAL')}
                    className={`py-1.5 rounded-lg font-bold border transition-all text-center ${
                      txType === 'WITHDRAWAL'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    سحب للمالك / بنك
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('SUPPLIER_PAYMENT')}
                    className={`py-1.5 rounded-lg font-bold border transition-all text-center ${
                      txType === 'SUPPLIER_PAYMENT'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    سداد دفعة لمورد
                  </button>
                </div>
              </div>

              {/* Category / Sub-account */}
              {txType === 'EXPENSE' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">بند المصروف</label>
                  <select
                    value={txCategory}
                    onChange={(e) => setTxCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="كهرباء">كهرباء وإنارة</option>
                    <option value="إيجار">إيجار المقر</option>
                    <option value="رواتب">رواتب وأجور صيادلة ومساعدين</option>
                    <option value="صيانة">صيانة وأجهزة ومكيفات</option>
                    <option value="نثريات">نثريات وضيافة ونظافة</option>
                    <option value="ضرائب_ورسوم">ضرائب وتأمينات ورسوم</option>
                  </select>
                </div>
              )}

              {/* Supplier Dropdown if SUPPLIER_PAYMENT */}
              {txType === 'SUPPLIER_PAYMENT' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المورد المستلم</label>
                  <select
                    value={txSupplierId}
                    onChange={(e) => setTxSupplierId(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">اختر المورد من الـ 17 شركة...</option>
                    {suppliers.map((s) => (
                      <option key={s.supplier_id} value={s.supplier_id}>
                        {s.supplier_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  المبلغ (ج.م) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  min={1}
                  value={txAmount}
                  onChange={(e) => setTxAmount(parseFloat(e.target.value) || '')}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">البيان / ملاحظات</label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="وصف تفصيلي للحركة..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-sans focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddTxOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingTx}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                {savingTx ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>تسجيل القيد والخزينة</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Open Shift Modal */}
      {isOpenShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
          <form
            onSubmit={handleOpenShift}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>فتح وردية جديدة لكاشير الصيدلية</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsOpenShiftModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اسم الصيدلي / الكاشير المناوب *
                </label>
                <input
                  type="text"
                  required
                  value={newShiftUserName}
                  onChange={(e) => setNewShiftUserName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-sans font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  الرصيد الافتتاحي في الدرج (ج.م) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={newShiftOpeningBalance}
                  onChange={(e) => setNewShiftOpeningBalance(parseFloat(e.target.value) || '')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  مأخوذ تلقائياً من رصيد الخزينة الحالي ({treasury?.cash_balance.toFixed(2)} ج.م)
                </span>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpenShiftModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingShift}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                {savingShift ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>تأكيد فتح الوردية</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Close Shift Modal (Z-Report) */}
      {isCloseShiftModalOpen && currentShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
          <form
            onSubmit={handleCloseShift}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-rose-600" />
                <span>تقفيل الوردية وتسليم الدرج (Z-Report)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCloseShiftModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Summary Box */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between text-slate-600">
                  <span>الصيدلي المناوب:</span>
                  <strong className="text-slate-900">{currentShift.user_name}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>وقت البداية:</span>
                  <strong className="font-mono">{currentShift.start_time}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>الرصيد الافتتاحي:</span>
                  <strong className="font-mono">{currentShift.opening_balance.toFixed(2)} ج.م</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>مبيعات الكاش بالوردية:</span>
                  <strong className="font-mono text-emerald-600">+{currentShift.cash_sales.toFixed(2)} ج.م</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>المرتجع والمصروفات:</span>
                  <strong className="font-mono text-rose-600">-{(currentShift.returns_amount + currentShift.expenses_amount).toFixed(2)} ج.م</strong>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                  <span>النقدية المتوقعة بالدرج (Expected):</span>
                  <span className="font-mono text-blue-700">
                    {(currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount).toFixed(2)} ج.م
                  </span>
                </div>
              </div>

              {/* Actual Counted Input */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  النقدية الفعلية المعدودة في الدرج الآن (ج.م) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={closeActualCash}
                  onChange={(e) => setCloseActualCash(parseFloat(e.target.value) || '')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Calculated Discrepancy indicator */}
              {closeActualCash !== '' && (
                <div className={`p-3 rounded-lg border flex items-center justify-between font-bold ${
                  Number(closeActualCash) - (currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount) === 0
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : Number(closeActualCash) - (currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount) > 0
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  <span>نتيجة الجرد والمطابقة:</span>
                  <span className="font-mono">
                    {Number(closeActualCash) - (currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount) === 0
                      ? 'مطابق تماماً (0.00 ج.م)'
                      : Number(closeActualCash) - (currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount) > 0
                      ? `زيادة بالدرج: +${(Number(closeActualCash) - (currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount)).toFixed(2)} ج.م`
                      : `عجز بالدرج: ${(Number(closeActualCash) - (currentShift.opening_balance + currentShift.cash_sales - currentShift.returns_amount - currentShift.expenses_amount)).toFixed(2)} ج.م`}
                  </span>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات التقفيل</label>
                <textarea
                  rows={2}
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="أي ملاحظات حول العجز أو التسليم للكاشير التالي..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCloseShiftModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingShift}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                {savingShift ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                <span>تقفيل وطباعة تقرير Z-Report</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Customer Debt Payment Modal */}
      {selectedCustomerForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
          <form
            onSubmit={handleSaveCustomerPayment}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>تحصيل دفعة نقدية من عميل آجل</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedCustomerForPayment(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 text-xs">
              <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100 flex justify-between items-center">
                <div>
                  <span className="text-slate-500 block text-[11px]">اسم العميل:</span>
                  <strong className="text-slate-900">{selectedCustomerForPayment.customer_name}</strong>
                </div>
                <div className="text-left">
                  <span className="text-slate-500 block text-[11px]">المديونية الحالية:</span>
                  <strong className="font-mono text-rose-600 text-sm">
                    {selectedCustomerForPayment.account_balance.toFixed(2)} ج.م
                  </strong>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  المبلغ المحصل نقداً (ج.م) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  min={1}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || '')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات التحصيل</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="دفعة تحت الحساب / سداد فاتورة..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-sans focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedCustomerForPayment(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingPayment}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                {savingPayment ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>تحصيل وإيداع بالخزينة</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
