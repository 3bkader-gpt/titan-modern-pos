import React, { useState, useEffect, useCallback } from 'react';
import {
  SmartShortageItem,
  Supplier,
  ItemVelocityAndBestSupplierReport
} from '../../../../shared/types';
import { ExportExcelButton } from '../common/ExportExcelButton';
import {
  Sparkles,
  Search,
  RefreshCw,
  Truck,
  TrendingUp,
  Award,
  CheckSquare,
  Square,
  Sliders
} from 'lucide-react';

interface SmartShortagesTabProps {
  suppliers: Supplier[];
  onTransferToPurchases?: (selectedItems: Array<{
    item_id: number;
    item_name_en: string;
    item_name_ar?: string;
    quantity: number;
    consumer_price: number;
    buy_price: number;
    discount_pct?: number;
    expiry_date?: string;
  }>) => void;
}

export const SmartShortagesTab: React.FC<SmartShortagesTabProps> = ({
  suppliers,
  onTransferToPurchases
}) => {
  const [items, setItems] = useState<SmartShortageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [onlyCritical, setOnlyCritical] = useState<boolean>(false);
  const [supplierId, setSupplierId] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [customOrderQtys, setCustomOrderQtys] = useState<Record<number, number>>({});
  const [inspectedReport, setInspectedReport] = useState<ItemVelocityAndBestSupplierReport | null>(null);
  const [autoCalculating, setAutoCalculating] = useState<boolean>(false);
  const [banner, setBanner] = useState<string>('');

  const loadSmartShortages = useCallback(async () => {
    if (!window.electronAPI?.getSmartShortages) return;
    setLoading(true);
    try {
      const rows = await window.electronAPI.getSmartShortages({
        onlyCritical,
        supplierId: supplierId > 0 ? supplierId : undefined,
        searchQuery: searchQuery.trim() || undefined,
        daysLookback: 30,
        limit: 200
      });
      setItems(rows || []);
    } catch (err) {
      console.error('Failed to load smart shortages:', err);
    } finally {
      setLoading(false);
    }
  }, [onlyCritical, supplierId, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSmartShortages();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadSmartShortages]);

  const handleInspectItem = async (itemId: number) => {
    if (!window.electronAPI?.getItemVelocityAndBestSupplier) return;
    try {
      const report = await window.electronAPI.getItemVelocityAndBestSupplier(itemId);
      setInspectedReport(report);
    } catch (err) {
      console.error('Failed to load item velocity:', err);
    }
  };

  const handleUpdateThreshold = async (item: SmartShortageItem, newMin: number, newMax: number) => {
    if (!window.electronAPI?.updateItemStockThresholds) return;
    try {
      await window.electronAPI.updateItemStockThresholds(item.item_id, newMin, newMax, 1);
      setItems(prev =>
        prev.map(r => (r.item_id === item.item_id ? { ...r, min_stock: newMin, max_stock: newMax } : r))
      );
      setBanner(`تم تحديث حد الطلب للصنف ${item.item_name_en} (${newMin} – ${newMax})`);
    } catch (err) {
      console.error('Failed updating thresholds:', err);
    }
  };

  const handleAutoSuggestAll = async () => {
    if (!window.electronAPI?.autoSuggestMinMaxFromSales) return;
    setAutoCalculating(true);
    try {
      const res = await window.electronAPI.autoSuggestMinMaxFromSales(60);
      setBanner(`تم احتساب وضبط حد الطلب والحد الأقصى تلقائياً لـ ${res.updatedCount} صنفاً بناءً على مبيعات آخر 60 يوماً.`);
      await loadSmartShortages();
    } catch (err) {
      console.error('Auto suggest failed:', err);
    } finally {
      setAutoCalculating(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTransferSelected = () => {
    if (!onTransferToPurchases) return;
    const chosen = items.filter(it => selectedIds.has(it.item_id));
    if (chosen.length === 0) return;

    onTransferToPurchases(
      chosen.map(it => ({
        item_id: it.item_id,
        item_name_en: it.item_name_en,
        item_name_ar: it.item_name_ar,
        quantity: customOrderQtys[it.item_id] ?? it.suggested_order_qty ?? 1,
        consumer_price: it.consumer_price,
        buy_price: it.best_net_cost && it.best_net_cost > 0 ? it.best_net_cost : it.buy_price,
        discount_pct: it.best_discount_pct ?? it.discount_pct
      }))
    );
  };

  const getUrgencyBadge = (urgency: SmartShortageItem['urgency'], days: number | null) => {
    if (urgency === 'OUT_OF_STOCK') {
      return <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">رصيد 0</span>;
    }
    if (urgency === 'LOW_COVER') {
      return (
        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">
          يكفي {days ?? 0} يوم
        </span>
      );
    }
    if (urgency === 'BELOW_MIN') {
      return <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">أقل من حد الطلب</span>;
    }
    return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">مسودة يدوية</span>;
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث في النواقص الذكية..."
              className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden"
            />
          </div>

          <select
            value={supplierId}
            onChange={e => setSupplierId(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 font-semibold"
          >
            <option value={0}>كل الموردين (الأفضل تاريخياً)</option>
            {suppliers.map(s => (
              <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyCritical(v => !v)}
            className={`px-3 py-1.5 rounded-lg border font-bold cursor-pointer transition-colors ${
              onlyCritical
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            الحرج فقط (&lt; 5 أيام / صفر)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={autoCalculating}
            onClick={handleAutoSuggestAll}
            className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{autoCalculating ? 'جاري الحساب...' : 'حساب حد الطلب من سحب 60 يوم'}</span>
          </button>

          <ExportExcelButton
            fileNamePrefix="النواقص_الذكية_ومعدل_السحب"
            disabled={items.length === 0}
            headers={['كود', 'الصنف', 'الرصيد', 'حد الطلب', 'سحب 30 يوم', 'أيام الكفاية', 'الكمية المقترحة', 'أفضل مورد', 'أفضل خصم %', 'صافي التكلفة']}
            getRows={() =>
              items.map(it => [
                it.item_id,
                it.item_name_en,
                it.current_stock,
                it.min_stock,
                it.sold_last_30d,
                it.days_of_cover ?? '—',
                customOrderQtys[it.item_id] ?? it.suggested_order_qty,
                it.best_supplier_name || '',
                it.best_discount_pct || 0,
                it.best_net_cost || it.buy_price
              ])
            }
          />

          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={handleTransferSelected}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>تحويل المحدد ({selectedIds.size}) للمشتريات</span>
          </button>
        </div>
      </div>

      {banner && (
        <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex justify-between">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner('')} className="cursor-pointer">×</button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <div className={`${inspectedReport ? 'xl:col-span-3' : 'xl:col-span-4'} bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-2.5 px-2.5 w-8 text-center">✓</th>
                  <th className="py-2.5 px-3">الصنف</th>
                  <th className="py-2.5 px-2 text-center">الحالة</th>
                  <th className="py-2.5 px-2 text-center">الرصيد</th>
                  <th className="py-2.5 px-2 text-center">حد الطلب</th>
                  <th className="py-2.5 px-2 text-center">سحب الشهر</th>
                  <th className="py-2.5 px-2 text-center">يكفي (يوم)</th>
                  <th className="py-2.5 px-2 text-center">الطلب المقترح</th>
                  <th className="py-2.5 px-3">أفضل مورد تاريخي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-blue-600" />
                      جاري تحليل معدلات السحب...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400 font-semibold">
                      لا توجد نواقص ذكية مطابقة حالياً. جرّب ضبط حد الطلب أو زر "حساب حد الطلب من سحب 60 يوم".
                    </td>
                  </tr>
                ) : (
                  items.map(it => {
                    const checked = selectedIds.has(it.item_id);
                    const orderVal = customOrderQtys[it.item_id] ?? it.suggested_order_qty;
                    return (
                      <tr
                        key={it.item_id}
                        onClick={() => void handleInspectItem(it.item_id)}
                        className={`cursor-pointer transition-colors ${checked ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="py-2 px-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <button type="button" onClick={() => toggleSelect(it.item_id)} className="text-blue-600 cursor-pointer">
                            {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-400" />}
                          </button>
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900" dir="ltr">{it.item_name_en}</div>
                          {it.item_name_ar && <div className="text-[11px] text-slate-500">{it.item_name_ar}</div>}
                        </td>
                        <td className="py-2 px-2 text-center">{getUrgencyBadge(it.urgency, it.days_of_cover)}</td>
                        <td className="py-2 px-2 text-center font-mono font-bold text-slate-900">{it.current_stock}</td>
                        <td className="py-2 px-2 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            min={0}
                            defaultValue={it.min_stock}
                            onBlur={e => {
                              const nextMin = Math.max(0, Number(e.target.value) || 0);
                              if (nextMin !== it.min_stock) {
                                void handleUpdateThreshold(it, nextMin, Math.max(nextMin * 2, it.max_stock));
                              }
                            }}
                            className="w-14 px-1 py-0.5 text-center font-mono border border-slate-200 rounded bg-slate-50 focus:bg-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-indigo-700 font-bold">{it.sold_last_30d}</td>
                        <td className="py-2 px-2 text-center font-mono">
                          {it.days_of_cover !== null ? `${it.days_of_cover} ي` : '—'}
                        </td>
                        <td className="py-2 px-2 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            min={1}
                            value={orderVal}
                            onChange={e => setCustomOrderQtys(prev => ({ ...prev, [it.item_id]: Math.max(1, Number(e.target.value) || 1) }))}
                            className="w-14 px-1 py-0.5 text-center font-mono font-bold border border-blue-200 rounded bg-blue-50 text-blue-900"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-emerald-800">{it.best_supplier_name || '—'}</div>
                          {it.best_discount_pct !== undefined && it.best_discount_pct > 0 && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              خصم {it.best_discount_pct.toFixed(1)}% • صافي {(it.best_net_cost || 0).toFixed(2)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Velocity & Supplier Comparison Side Card */}
        {inspectedReport && (
          <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-2xs space-y-3 text-xs h-fit">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5 font-black text-indigo-900">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>تحليل السحب وأفضل مورد</span>
              </div>
              <button type="button" onClick={() => setInspectedReport(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">×</button>
            </div>

            <div>
              <div className="font-bold text-slate-900" dir="ltr">{inspectedReport.item_name_en}</div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-[10px] text-slate-500">معدل سحب 30 يوم</div>
                  <div className="font-mono font-black text-indigo-700">{inspectedReport.sold_last_30d} علبة/شهر</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-[10px] text-slate-500">يكفي لمدة</div>
                  <div className="font-mono font-black text-slate-900">
                    {inspectedReport.days_remaining !== null ? `${inspectedReport.days_remaining} يوم` : 'غير محسوب'}
                  </div>
                </div>
              </div>
            </div>

            {inspectedReport.best_supplier && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-800 font-black">
                  <Award className="w-4 h-4" />
                  <span>أفضل مورد تاريخي: {inspectedReport.best_supplier.supplier_name}</span>
                </div>
                <div className="text-[11px] text-emerald-900 font-mono">
                  خصم: {inspectedReport.best_supplier.discount_pct.toFixed(1)}% • صافي: {inspectedReport.best_supplier.net_unit_cost.toFixed(2)} ج.م
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                آخر عروض الشراء المسجلة:
              </div>
              {inspectedReport.recent_purchases.length === 0 ? (
                <div className="text-[11px] text-slate-400">لا توجد فواتير شراء مسجلة لهذا الصنف.</div>
              ) : (
                inspectedReport.recent_purchases.map((p, i) => (
                  <div key={`${p.purchase_invoice_id}-${i}`} className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-800">{p.supplier_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{p.invoice_date}</div>
                    </div>
                    <div className="text-left font-mono">
                      <div className="font-bold text-emerald-700">{p.discount_pct.toFixed(1)}%</div>
                      <div className="text-[10px] text-slate-600">{p.net_unit_cost.toFixed(2)} ج.م</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
