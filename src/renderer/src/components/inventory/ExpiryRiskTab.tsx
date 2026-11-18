import React, { useState, useEffect, useCallback } from 'react';
import { ExpiryRiskItem } from '../../../../shared/types';
import { ExportExcelButton } from '../common/ExportExcelButton';
import { CalendarClock, RefreshCw, AlertTriangle } from 'lucide-react';

export const ExpiryRiskTab: React.FC = () => {
  const [monthsAhead, setMonthsAhead] = useState<number>(6);
  const [rows, setRows] = useState<ExpiryRiskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const loadReport = useCallback(async () => {
    if (!window.electronAPI?.getExpiryRiskReport) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.getExpiryRiskReport(monthsAhead);
      setRows(data || []);
    } catch (err) {
      console.error('Failed loading expiry risk report:', err);
    } finally {
      setLoading(false);
    }
  }, [monthsAhead]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const totalAtRiskCost = rows.reduce((acc, r) => acc + r.at_risk_cost_egp, 0);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <CalendarClock className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-slate-900">تحليل مخاطر الإكسباير مقارنةً بمعدل السحب اليومي</div>
            <div className="text-[11px] text-slate-500">
              إجمالي رأس المال المعرض للخسارة: <strong className="font-mono text-rose-700">{totalAtRiskCost.toFixed(2)} ج.م</strong> ({rows.length} صنفاً)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-600">النطاق الزمني:</span>
          {[3, 6, 12].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMonthsAhead(m)}
              className={`px-3 py-1 rounded-lg font-bold border cursor-pointer ${
                monthsAhead === m
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {m} شهور
            </button>
          ))}
          <ExportExcelButton
            fileNamePrefix="مخاطر_الإكسباير_بالسرعة"
            disabled={rows.length === 0}
            headers={['كود', 'الصنف', 'الصلاحية', 'الرف', 'الرصيد', 'الأيام المتبقية', 'معدل السحب اليومي', 'المتوقع بيعه', 'كمية الخطر', 'التكلفة المعرضة للخسارة']}
            getRows={() =>
              rows.map(r => [
                r.item_id,
                r.item_name_en,
                r.expiry_date,
                r.shelf_location || '',
                r.current_stock,
                r.days_to_expiry,
                r.daily_velocity,
                r.expected_sold_before_expiry,
                r.at_risk_qty,
                r.at_risk_cost_egp
              ])
            }
          />
          <button type="button" onClick={loadReport} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th className="py-2.5 px-3">الصنف</th>
                <th className="py-2.5 px-2 text-center">الصلاحية</th>
                <th className="py-2.5 px-2 text-center">أيام متبقية</th>
                <th className="py-2.5 px-2 text-center">الرصيد</th>
                <th className="py-2.5 px-2 text-center">السحب اليومي</th>
                <th className="py-2.5 px-2 text-center">المتوقع بيعه</th>
                <th className="py-2.5 px-2 text-center">كمية الخطر</th>
                <th className="py-2.5 px-3 text-left">قيمة معرضة للخسارة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400">جاري تحليل الصلاحيات...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400">لا توجد أصناف مهددة بالإكسباير خلال هذه المدة.</td></tr>
              ) : (
                rows.slice(0, 120).map(r => (
                  <tr key={r.item_id} className="hover:bg-amber-50/30">
                    <td className="py-2 px-3 font-bold text-slate-900" dir="ltr">{r.item_name_en}</td>
                    <td className="py-2 px-2 text-center font-mono">{r.expiry_date}</td>
                    <td className="py-2 px-2 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        r.days_to_expiry <= 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {r.days_to_expiry <= 0 ? 'منتهي' : `${r.days_to_expiry} ي`}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold">{r.current_stock}</td>
                    <td className="py-2 px-2 text-center font-mono text-slate-600">{r.daily_velocity}</td>
                    <td className="py-2 px-2 text-center font-mono text-emerald-700">{r.expected_sold_before_expiry}</td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-rose-700">{r.at_risk_qty}</td>
                    <td className="py-2 px-3 text-left font-mono font-black text-rose-800 flex items-center justify-end gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                      {r.at_risk_cost_egp.toFixed(2)} ج.م
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
