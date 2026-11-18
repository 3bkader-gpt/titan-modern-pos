import React, { useState, useEffect, useCallback } from 'react';
import {
  Supplier,
  Item,
  PurchaseReturnRecord,
  AuthSession
} from '../../../../shared/types';
import { Search, Trash2, RotateCcw, CheckCircle2, RefreshCw } from 'lucide-react';

interface PurchaseReturnTabProps {
  suppliers: Supplier[];
  currentUser?: AuthSession | null;
  onRefreshSuppliers: () => void;
  onNotify: (text: string, type: 'success' | 'error') => void;
}

interface ReturnDraftLine {
  item_id: number;
  item_name: string;
  available_stock: number;
  quantity: number;
  unit_cost: number;
  expiry_date: string;
}

export const PurchaseReturnTab: React.FC<PurchaseReturnTabProps> = ({
  suppliers,
  currentUser,
  onRefreshSuppliers,
  onNotify
}) => {
  const [supplierId, setSupplierId] = useState<number>(suppliers[0]?.supplier_id ?? 4);
  const [returnType, setReturnType] = useState<'PURCHASE_RETURN' | 'EXPIRY_RETURN'>('PURCHASE_RETURN');
  const [settlementMode, setSettlementMode] = useState<'SUPPLIER_CREDIT' | 'CASH_REFUND'>('SUPPLIER_CREDIT');
  const [compensationPct, setCompensationPct] = useState<number>(100);
  const [notes, setNotes] = useState<string>('');
  const [lines, setLines] = useState<ReturnDraftLine[]>([]);

  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<Item[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [history, setHistory] = useState<PurchaseReturnRecord[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const list = await window.electronAPI.getPurchaseReturns(undefined, 30);
        setHistory(list || []);
      }
    } catch {
      // Ignore history fetch errors
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const list = await window.electronAPI.searchItems(query.trim(), true, 20);
        setResults(list || []);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const handleAddItem = (item: Item) => {
    setQuery('');
    setResults([]);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.item_id === item.item_id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: Math.min(updated[idx].available_stock, updated[idx].quantity + 1)
        };
        return updated;
      }
      const disc = item.discount_pct || item.pharmacy_discount_percent || 25;
      const defaultCost = item.buy_price && item.buy_price > 0
        ? item.buy_price
        : Math.round(item.consumer_price * (1 - disc / 100) * 100) / 100;
      return [
        ...prev,
        {
          item_id: item.item_id,
          item_name: item.item_name_en,
          available_stock: item.current_stock,
          quantity: Math.min(1, item.current_stock),
          unit_cost: defaultCost,
          expiry_date: item.expiry_date || ''
        }
      ];
    });
  };

  const totalCost = Math.round(
    lines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0) * 100
  ) / 100;
  const clampedComp = Math.min(100, Math.max(0, compensationPct));
  const supplierCredit = Math.round(totalCost * (clampedComp / 100) * 100) / 100;
  const expiryLoss = Math.round((totalCost - supplierCredit) * 100) / 100;

  const handleSubmit = async () => {
    if (!supplierId || lines.length === 0) {
      onNotify('اختر المورد وأضف صنفاً واحداً على الأقل لإتمام المرتجع.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await window.electronAPI.createPurchaseReturn({
        supplier_id: supplierId,
        return_type: returnType,
        settlement_mode: settlementMode,
        compensation_pct: clampedComp,
        notes: notes.trim() || undefined,
        user_id: currentUser?.user_id,
        cashier_name: currentUser?.user_name,
        items: lines.map((l) => ({
          item_id: l.item_id,
          item_name: l.item_name,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          expiry_date: l.expiry_date || undefined
        }))
      });
      onNotify(
        `تم تسجيل مرتجع المشتريات #${created.return_id} بنجاح (تعويض: ${created.credit_amount.toFixed(2)} ج.م | هوالك: ${created.expiry_loss_amount.toFixed(2)} ج.م)`,
        'success'
      );
      setLines([]);
      setNotes('');
      onRefreshSuppliers();
      await loadHistory();
      window.dispatchEvent(new Event('refresh-app-stats'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify(msg.replace(/^Error invoking remote method.*?:\s*Error:\s*/i, ''), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        {/* Left 3 cols: Settings + Search + Draft Table */}
        <div className="xl:col-span-3 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">المورد المستلم للمرتجع</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-bold text-slate-800"
              >
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.supplier_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">نوع المرتجع</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setReturnType('PURCHASE_RETURN');
                    setCompensationPct(100);
                  }}
                  className={`py-2 rounded-lg font-bold border text-[11px] cursor-pointer ${
                    returnType === 'PURCHASE_RETURN'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  مرتجع عادي
                </button>
                <button
                  type="button"
                  onClick={() => setReturnType('EXPIRY_RETURN')}
                  className={`py-2 rounded-lg font-bold border text-[11px] cursor-pointer ${
                    returnType === 'EXPIRY_RETURN'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  مرتجع إكسباير
                </button>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">طريقة التسوية</label>
              <select
                value={settlementMode}
                onChange={(e) => setSettlementMode(e.target.value as 'SUPPLIER_CREDIT' | 'CASH_REFUND')}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-bold text-slate-800"
              >
                <option value="SUPPLIER_CREDIT">خصم من حساب المورد الآجل</option>
                <option value="CASH_REFUND">استرداد نقدي إلى الخزينة</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">نسبة تعويض المورد (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={compensationPct}
                onChange={(e) => setCompensationPct(Number(e.target.value))}
                dir="ltr"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold text-slate-900"
              />
            </div>
          </div>

          {/* Search In-Stock Items to Return */}
          <div className="relative">
            <div className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن صنف بالرصيد لإرجاعه للمورد (اسم أو باركود)..."
                className="w-full bg-transparent text-xs outline-none text-slate-800"
              />
            </div>

            {results.length > 0 && (
              <div className="absolute z-30 top-full mt-1 inset-x-0 bg-white rounded-xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                {results.map((item) => (
                  <button
                    key={item.item_id}
                    type="button"
                    onClick={() => handleAddItem(item)}
                    className="w-full px-3 py-2 text-right hover:bg-blue-50 flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{item.item_name_en}</span>
                      <span className="text-[11px] text-slate-500 mr-2">{item.item_name_ar || ''}</span>
                    </div>
                    <div className="font-mono text-slate-700 flex items-center gap-3">
                      <span>رصيد: {item.current_stock}</span>
                      <span>إكسباير: {item.expiry_date || '—'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Draft Lines Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2.5 px-3">الصنف</th>
                  <th className="py-2.5 px-3 text-center">الرصيد المتاح</th>
                  <th className="py-2.5 px-3 text-center">الكمية المرتجعة</th>
                  <th className="py-2.5 px-3 text-left">تكلفة الوحدة</th>
                  <th className="py-2.5 px-3 text-center">الصلاحية</th>
                  <th className="py-2.5 px-3 text-left">الإجمالي</th>
                  <th className="py-2.5 px-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      أضف الأصناف المراد إرجاعها من شريط البحث أعلاه
                    </td>
                  </tr>
                ) : (
                  lines.map((line, idx) => (
                    <tr key={line.item_id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-slate-900">{line.item_name}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {line.available_stock}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          min="0.1"
                          max={line.available_stock}
                          step="any"
                          value={line.quantity}
                          onChange={(e) => {
                            const val = Math.min(
                              line.available_stock,
                              Math.max(0.1, parseFloat(e.target.value) || 0.1)
                            );
                            setLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l))
                            );
                          }}
                          className="w-16 px-2 py-1 text-center font-mono font-bold border border-slate-300 rounded-lg"
                        />
                      </td>
                      <td className="py-2 px-3 text-left">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_cost}
                          onChange={(e) => {
                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                            setLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, unit_cost: val } : l))
                            );
                          }}
                          dir="ltr"
                          className="w-20 px-2 py-1 font-mono font-bold border border-slate-300 rounded-lg"
                        />
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-500">
                        {line.expiry_date || '—'}
                      </td>
                      <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                        {(line.quantity * line.unit_cost).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Split Preview & Confirm */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3 h-fit">
          <h3 className="text-xs font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-amber-600" />
            <span>ملخص تسوية المرتجع</span>
          </h3>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">إجمالي التكلفة الخارجة:</span>
              <strong className="font-mono text-slate-900">{totalCost.toFixed(2)} ج.م</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-emerald-700">تعويض المورد ({clampedComp}%):</span>
              <strong className="font-mono text-emerald-700">{supplierCredit.toFixed(2)} ج.م</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-rose-700">فارق هوالك وإكسباير:</span>
              <strong className="font-mono text-rose-700">{expiryLoss.toFixed(2)} ج.م</strong>
            </div>
          </div>

          <div className="text-xs">
            <label className="block font-bold text-slate-700 mb-1">ملاحظات المرتجع</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: مرتجع إكسباير شهري للمخزن"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs outline-none"
            />
          </div>

          <button
            type="button"
            disabled={submitting || lines.length === 0}
            onClick={handleSubmit}
            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{submitting ? 'جاري الترحيل...' : 'اعتماد مرتجع المشتريات'}</span>
          </button>
        </div>
      </div>

      {/* Recent Purchase Returns History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">سجل مرتجعات المشتريات والإكسباير ({history.length})</span>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">التاريخ</th>
                <th className="py-2 px-3">المورد</th>
                <th className="py-2 px-3 text-center">النوع</th>
                <th className="py-2 px-3 text-center">التسوية</th>
                <th className="py-2 px-3 text-left">إجمالي التكلفة</th>
                <th className="py-2 px-3 text-left">التعويض</th>
                <th className="py-2 px-3 text-left">فارق هوالك</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    لا توجد مرتجعات مشتريات مسجلة بعد
                  </td>
                </tr>
              ) : (
                history.map((r) => (
                  <tr key={r.return_id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-bold text-blue-700">#{r.return_id}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{r.return_date}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{r.supplier_name}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.return_type === 'EXPIRY_RETURN'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {r.return_type === 'EXPIRY_RETURN' ? 'إكسباير' : 'مشتريات'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-[11px]">
                      {r.settlement_mode === 'CASH_REFUND' ? 'استرداد نقدي' : 'خصم حساب مورد'}
                    </td>
                    <td className="py-2 px-3 text-left font-mono">{r.total_cost_value.toFixed(2)}</td>
                    <td className="py-2 px-3 text-left font-mono font-bold text-emerald-700">
                      {r.credit_amount.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-left font-mono text-rose-700">
                      {r.expiry_loss_amount.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
