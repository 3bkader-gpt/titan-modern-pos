import React, { useState, useEffect, useCallback } from 'react';
import { Supplier, SupplierStatementReport, AuthSession } from '../../../../shared/types';
import { Wallet, RefreshCw, Printer, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';

interface SupplierStatementTabProps {
  suppliers: Supplier[];
  initialSupplierId?: number | '';
  currentUser?: AuthSession | null;
  onRefreshSuppliers: () => void;
  onNotify: (text: string, type: 'success' | 'error') => void;
}

export const SupplierStatementTab: React.FC<SupplierStatementTabProps> = ({
  suppliers,
  initialSupplierId,
  currentUser,
  onRefreshSuppliers,
  onNotify
}) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(
    Number(initialSupplierId) || (suppliers[0]?.supplier_id ?? 4)
  );
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [report, setReport] = useState<SupplierStatementReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Payment form
  const [payAmount, setPayAmount] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [paying, setPaying] = useState<boolean>(false);

  useEffect(() => {
    if (initialSupplierId && Number(initialSupplierId) > 0) {
      setSelectedSupplierId(Number(initialSupplierId));
    } else if (suppliers.length > 0 && !suppliers.some((s) => s.supplier_id === selectedSupplierId)) {
      setSelectedSupplierId(suppliers[0].supplier_id);
    }
  }, [initialSupplierId, suppliers, selectedSupplierId]);

  const loadStatement = useCallback(async () => {
    if (!selectedSupplierId || !window.electronAPI) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.getSupplierStatement(
        selectedSupplierId,
        fromDate || undefined,
        toDate || undefined
      );
      setReport(data);
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedSupplierId, fromDate, toDate, onNotify]);

  useEffect(() => {
    void loadStatement();
  }, [loadStatement]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmt = parseFloat(payAmount);
    if (!numericAmt || numericAmt <= 0) {
      onNotify('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر.', 'error');
      return;
    }

    setPaying(true);
    try {
      const res = await window.electronAPI.recordSupplierPayment({
        supplier_id: selectedSupplierId,
        amount: numericAmt,
        notes: payNotes.trim() || undefined,
        user_id: currentUser?.user_id,
        cashier_name: currentUser?.user_name
      });
      onNotify(
        `تم سداد ${res.amount.toFixed(2)} ج.م للمورد ${res.supplier_name} بنجاح (رصيد الخزينة: ${res.new_treasury_balance.toFixed(2)} ج.م)`,
        'success'
      );
      setPayAmount('');
      setPayNotes('');
      onRefreshSuppliers();
      await loadStatement();
      window.dispatchEvent(new Event('refresh-app-stats'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify(msg.replace(/^Error invoking remote method.*?:\s*Error:\s*/i, ''), 'error');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      {/* Top Filters & GL Payable Summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">اختر المورد</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    #{s.supplier_id} — {s.supplier_name} (رصيد: {(s.current_balance ?? 0).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">من تاريخ</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-mono text-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-mono text-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadStatement()}
              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة الكشف</span>
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {report && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
            <div className="p-3 rounded-xl bg-slate-900 text-white">
              <div className="text-[11px] text-slate-300">رصيد المورد المستحق</div>
              <div className="text-lg font-mono font-black mt-0.5">
                {report.closing_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-[11px] font-sans font-normal mr-1">ج.م</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-[11px] text-blue-700">مشتريات آجل</div>
              <div className="text-base font-mono font-bold text-blue-900 mt-0.5">
                {report.total_purchases_credit.toFixed(2)} ج.م
              </div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[11px] text-emerald-700">إجمالي المسدد</div>
              <div className="text-base font-mono font-bold text-emerald-900 mt-0.5">
                {report.total_payments.toFixed(2)} ج.م
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-[11px] text-amber-800">مرتجعات مخصومة</div>
              <div className="text-base font-mono font-bold text-amber-900 mt-0.5">
                {report.total_returns_credit.toFixed(2)} ج.م
              </div>
            </div>
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
              <div className="text-[11px] text-purple-800">إجمالي الموردين بالأستاذ العام</div>
              <div className="text-base font-mono font-bold text-purple-900 mt-0.5">
                {report.total_gl_suppliers_payable.toFixed(2)} ج.م
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment Box + Statement Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        {/* Cash Payment Form */}
        <form
          onSubmit={handleRecordPayment}
          className="xl:col-span-1 bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3 h-fit"
        >
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">سداد دفعة نقدية للمورد</h3>
              <p className="text-[10px] text-slate-500">يخصم من الخزينة ويسجل قيد GL متزن</p>
            </div>
          </div>

          <div className="text-xs">
            <label className="block font-bold text-slate-700 mb-1">المبلغ المدفوع (ج.م) *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0.00"
              dir="ltr"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono font-bold text-slate-900 focus:border-emerald-500 outline-none"
            />
          </div>

          <div className="text-xs">
            <label className="block font-bold text-slate-700 mb-1">ملاحظات / رقم إيصال السداد</label>
            <input
              type="text"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="مثال: دفعة نقدية للمندوب"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={paying}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{paying ? 'جاري تسجيل السداد...' : 'اعتماد سداد الدفعة'}</span>
          </button>

          {report && report.closing_balance <= 0 && (
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>رصيد هذا المورد مصفّر أو دائن لصالح الصيدلية حالياً.</span>
            </div>
          )}
        </form>

        {/* Chronological Statement Table */}
        <div className="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>حركات كشف الحساب التفصيلي ({report?.entries.length || 0} حركة)</span>
            </span>
          </div>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">البيان</th>
                  <th className="py-2.5 px-3">المرجع</th>
                  <th className="py-2.5 px-3 text-left">مشتريات (+مديونية)</th>
                  <th className="py-2.5 px-3 text-left">سداد/مرتجع (-خصم)</th>
                  <th className="py-2.5 px-3 text-left">الرصيد التراكمي</th>
                  <th className="py-2.5 px-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      جاري تحميل كشف الحساب...
                    </td>
                  </tr>
                ) : !report || report.entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      لا توجد حركات مسجلة لهذا المورد في الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  report.entries.map((entry) => (
                    <tr key={entry.entry_key} className="hover:bg-slate-50/90">
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {entry.date === '0000-00-00' ? 'افتتاحي' : entry.date}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900">{entry.label}</td>
                      <td className="py-2 px-3 font-mono text-blue-700">{entry.reference}</td>
                      <td className="py-2 px-3 text-left font-mono text-rose-700 font-bold">
                        {entry.credit_effect > 0 ? `+${entry.credit_effect.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-left font-mono text-emerald-700 font-bold">
                        {entry.debit_effect > 0 ? `-${entry.debit_effect.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-left font-mono font-extrabold text-slate-900">
                        {entry.running_balance.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-slate-500 max-w-[200px] truncate" title={entry.notes}>
                        {entry.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
