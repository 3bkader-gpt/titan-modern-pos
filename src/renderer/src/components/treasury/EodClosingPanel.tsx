import React, { useState, useEffect, useCallback } from 'react';
import { DailyClosingRecord, TreasuryOverview } from '../../../../shared/types';
import { 
  Lock, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  ShieldCheck, 
  Database, 
  TrendingUp, 
  TrendingDown, 
  FileText,
  AlertCircle
} from 'lucide-react';

export const EodClosingPanel: React.FC = () => {
  const [treasury, setTreasury] = useState<TreasuryOverview | null>(null);
  const [closings, setClosings] = useState<DailyClosingRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [countedCash, setCountedCash] = useState<number | ''>('');
  const [notes, setNotes] = useState<string>('');
  const [executing, setExecuting] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const [tData, cData] = await Promise.all([
          window.electronAPI.getTreasuryOverview(),
          window.electronAPI.getDailyClosings(20)
        ]);
        setTreasury(tData);
        setClosings(cData || []);
        if (tData && countedCash === '') {
          setCountedCash(tData.cash_balance);
        }
      }
    } catch (err) {
      console.error('Failed to load EOD data:', err);
    } finally {
      setLoading(false);
    }
  }, [countedCash]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const expectedCash = treasury ? treasury.cash_balance : 0;
  const countedNum = typeof countedCash === 'number' ? countedCash : 0;
  const variance = Math.round((countedNum - expectedCash) * 100) / 100;

  const handleExecuteClosing = async () => {
    if (typeof countedCash !== 'number' || isNaN(countedCash)) {
      setResultMessage({ type: 'error', text: 'يرجى إدخال المبلغ النقدي الفعلي الموجود بالدرج.' });
      return;
    }

    const confirmMsg = `هل أنت متأكد من تنفيذ إغلاق نهاية اليوم؟\n\n- النقدية الفعلية: ${countedCash.toFixed(2)} ج.م\n- النقدية المتوقعة: ${expectedCash.toFixed(2)} ج.م\n- الفارق: ${variance >= 0 ? '+' : ''}${variance.toFixed(2)} ج.م\n\nتنبيه: سيتم قفل جميع فواتير اليوم ومنع تعديلها وتشغيل النسخ الاحتياطي التلقائي.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setExecuting(true);
    setResultMessage(null);
    try {
      if (window.electronAPI?.executeDailyClosing) {
        const res = await window.electronAPI.executeDailyClosing({
          counted_cash: countedCash,
          notes: notes.trim(),
          closed_by_user_id: 1,
          closed_by_user_name: 'د. مريم الحميلي'
        });

        const backupNote = res.backup_completed ? ' وتم إتمام النسخ الاحتياطي بنجاح.' : ' (تنبيه: النسخ الاحتياطي قيد المعالجة).';
        const glNote = res.gl_variance_posted ? ' تم قيد فارق الخزينة بالأستاذ العام.' : '';
        setResultMessage({
          type: 'success',
          text: `تم إغلاق يومية ${res.closing.closing_date} بنجاح (رقم #${res.closing.closing_id}) وتم قفل الفواتير.${glNote}${backupNote}`
        });

        await loadData();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResultMessage({ type: 'error', text: msg });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* EOD Action Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-xl border border-slate-700/60">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">إغلاق نهاية اليوم المالي وقفل اليومية (EOD Closing)</h3>
                <span className="px-2 py-0.5 text-2xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  قفل أمني محكم
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                جرد نقدي للدرج، قفل فواتير اليوم، قيد عجز/زيادة الخزينة بالأستاذ، وتشغيل النسخ الاحتياطي التلقائي
              </p>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/10"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {resultMessage && (
          <div className={`p-4 rounded-xl mb-5 text-xs font-bold flex items-center gap-2 border ${
            resultMessage.type === 'success' 
              ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-100' 
              : 'bg-rose-500/20 border-rose-400/30 text-rose-100'
          }`}>
            {resultMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{resultMessage.text}</span>
          </div>
        )}

        {/* Financial Counts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <span className="text-xs text-slate-400 block mb-1">الرصيد الدفتري المتوقع بالدرج</span>
            <div className="text-2xl font-bold font-mono text-white">
              {expectedCash.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              <span className="text-xs text-slate-400 font-normal">ج.م</span>
            </div>
            <span className="text-2xs text-slate-400 mt-1 block">رصيد الخزينة الحالي بالنظام</span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <label className="text-xs text-indigo-300 font-bold block mb-1">المبلغ الفعلي بعد الجرد النقدي (ج.م)</label>
            <input
              type="number"
              step="0.01"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value === '' ? '' : parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-indigo-400/40 rounded-lg px-3 py-1.5 text-lg font-bold font-mono text-emerald-400 outline-none focus:border-indigo-400"
              placeholder="0.00"
            />
            <span className="text-2xs text-slate-400 mt-1 block">أدخل ما تم عده في الدرج يدوياً</span>
          </div>

          <div className={`border rounded-xl p-4 ${
            Math.abs(variance) < 0.01 
              ? 'bg-emerald-500/10 border-emerald-400/30' 
              : variance < 0 
                ? 'bg-rose-500/10 border-rose-400/30' 
                : 'bg-amber-500/10 border-amber-400/30'
          }`}>
            <span className="text-xs text-slate-300 block mb-1">فارق الجرد (العجز / الزيادة)</span>
            <div className={`text-2xl font-bold font-mono ${
              Math.abs(variance) < 0.01 ? 'text-emerald-400' : variance < 0 ? 'text-rose-400' : 'text-amber-400'
            }`}>
              {variance >= 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)}{' '}
              <span className="text-xs text-slate-400 font-normal">ج.م</span>
            </div>
            <span className="text-2xs text-slate-400 mt-1 block">
              {Math.abs(variance) < 0.01 
                ? 'جرد مطابق تماماً بنسبة 100%' 
                : variance < 0 
                  ? 'عجز خزينة (سيقيد مصروف تشغيلي)' 
                  : 'زيادة نقدية (ستقيد إيراد زيادة خزينة)'}
            </span>
          </div>
        </div>

        {/* Notes & Confirm Button */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[240px]">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات ختام اليومية (اختياري)..."
              className="w-full bg-white/10 text-white placeholder-slate-400 rounded-xl px-4 py-2.5 text-xs outline-none border border-white/15 focus:border-indigo-400"
            />
          </div>

          <button
            onClick={handleExecuteClosing}
            disabled={executing || typeof countedCash !== 'number'}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Lock className={`w-4 h-4 ${executing ? 'animate-spin' : ''}`} />
            <span>تنفيذ إغلاق اليومية وقفل الفواتير والنسخ الاحتياطي</span>
          </button>
        </div>
      </div>

      {/* Previous Closings History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-bold text-slate-700">سجل الإغلاقات اليومية السابقة</h4>
          </div>
          <span className="text-2xs text-slate-400">آخر 20 إغلاق مقفل</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">تاريخ الإغلاق</th>
                <th className="py-3 px-3 text-left">المتوقع</th>
                <th className="py-3 px-3 text-left">الفعلي</th>
                <th className="py-3 px-3 text-left">الفارق</th>
                <th className="py-3 px-3 text-left">مبيعات اليوم</th>
                <th className="py-3 px-3 text-left">صافي رأس المال</th>
                <th className="py-3 px-3">أُغلق بواسطة</th>
                <th className="py-3 px-3 text-center">النسخ الاحتياطي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {closings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    لم يتم تسجيل إغلاقات يومية سابقة بعد.
                  </td>
                </tr>
              ) : (
                closings.map((c) => (
                  <tr key={c.closing_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{c.closing_date}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-slate-600">
                      {c.expected_cash.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-bold text-slate-800">
                      {c.counted_cash.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-bold">
                      <span className={c.cash_variance === 0 ? 'text-emerald-600' : c.cash_variance < 0 ? 'text-rose-600' : 'text-amber-600'}>
                        {c.cash_variance >= 0 ? `+${c.cash_variance.toFixed(2)}` : c.cash_variance.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-slate-700">
                      {c.total_sales.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-bold text-indigo-700">
                      {c.net_capital_snapshot.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {c.closed_by_user_name}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                        c.backup_status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {c.backup_status === 'COMPLETED' ? 'تم بنجاح' : c.backup_status || 'معلق'}
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
  );
};
