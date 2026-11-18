import React, { useState, useEffect, useCallback } from 'react';
import { LiveNetCapitalReport } from '../../../../shared/types';
import { 
  DollarSign, 
  Package, 
  Wallet, 
  Users, 
  ShieldCheck, 
  Truck, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';

export const LiveNetCapitalCard: React.FC = () => {
  const [report, setReport] = useState<LiveNetCapitalReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.getLiveNetCapitalReport) {
        const data = await window.electronAPI.getLiveNetCapitalReport();
        setReport(data);
      }
    } catch (err) {
      console.error('Failed to load live net capital report:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !report) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-center gap-3 text-slate-500 shadow-2xs">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
        <span className="text-sm font-medium">جاري حساب صافي رأس المال الحي لحظياً من الأستاذ العام والمخزون...</span>
      </div>
    );
  }

  if (!report) return null;

  const isGlBalanced = report.gl_integrity?.diff === 0;

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-800/40 relative overflow-hidden mb-6">
      {/* Background Glow */}
      <div className="absolute -right-20 -top-20 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-wide">مؤشر صافي رأس المال الحي للصيدلية</h3>
              <span className="px-2 py-0.5 text-2xs font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                LIVE NET CAPITAL
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              محسوب لحظياً وفق معادلة: البضاعة بالتكلفة + الخزينة + العملاء + التأمين − الموردين
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* GL status pill */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
            isGlBalanced 
              ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300' 
              : 'bg-rose-500/15 border-rose-400/30 text-rose-300'
          }`}>
            {isGlBalanced ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>الأستاذ العام متوازن (0.00 ج.م)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>فارق الأستاذ: {report.gl_integrity?.diff.toFixed(2)} ج.م</span>
              </>
            )}
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/10 disabled:opacity-50"
            title="تحديث لحظي"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Net Capital Figure */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6 relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-300 block mb-1">صافي القيمة التشغيلية الإجمالية (Net Worth)</span>
          <div className="text-3xl md:text-4xl font-extrabold text-emerald-400 tracking-tight font-mono">
            {report.net_capital.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            <span className="text-sm font-bold text-slate-400">ج.م</span>
          </div>
        </div>
        <div className="text-left text-2xs text-slate-400">
          <div>تاريخ الاحتساب: {report.as_of_timestamp}</div>
          <div className="mt-0.5 text-slate-500">حسابات شيت 2026 ونظام #1989 موحدة</div>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 relative z-10 text-xs">
        {/* Inventory Cost */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-blue-300 font-semibold mb-1.5">
            <Package className="w-3.5 h-3.5" />
            <span>مخزون البضاعة (تكلفة)</span>
          </div>
          <div className="text-base font-bold text-white font-mono">
            +{report.inventory_cost_value.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-2xs text-slate-400">أصناف برصيد موجب</span>
        </div>

        {/* Cash */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-emerald-300 font-semibold mb-1.5">
            <Wallet className="w-3.5 h-3.5" />
            <span>نقدية الخزينة</span>
          </div>
          <div className="text-base font-bold text-emerald-300 font-mono">
            +{report.cash_balance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-2xs text-slate-400">رصيد الدرج الحي</span>
        </div>

        {/* Customer Receivables */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-amber-300 font-semibold mb-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>آجل العملاء</span>
          </div>
          <div className="text-base font-bold text-white font-mono">
            +{report.customer_receivables.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-2xs text-slate-400">ذمم مدينة مستحقة</span>
        </div>

        {/* Insurance Receivables */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-cyan-300 font-semibold mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>مطالبات التأمين</span>
          </div>
          <div className="text-base font-bold text-white font-mono">
            +{report.insurance_receivables.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-2xs text-slate-400">ذمم شركات التأمين</span>
        </div>

        {/* Suppliers Payable */}
        <div className="bg-white/5 border border-rose-500/30 rounded-xl p-3 bg-rose-500/10">
          <div className="flex items-center gap-1.5 text-rose-300 font-semibold mb-1.5">
            <Truck className="w-3.5 h-3.5" />
            <span>مديونية الموردين</span>
          </div>
          <div className="text-base font-bold text-rose-300 font-mono">
            -{report.suppliers_payable.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-2xs text-slate-400">خصوم متداولة للأستاذ</span>
        </div>
      </div>
    </div>
  );
};
