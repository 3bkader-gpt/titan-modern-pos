import React, { useState, useEffect, useCallback } from 'react';
import { 
  FinancialReport, 
  StockValuationReport, 
  TopItem, 
  StagnantItem, 
  UserAccount, 
  AuditLogs 
} from '../../../shared/types';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  ShieldAlert, 
  Users, 
  FileSpreadsheet, 
  Printer, 
  RefreshCw, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  History, 
  Activity, 
  Sparkles,
  Search,
  CheckCircle2,
  Clock
} from 'lucide-react';

export const ReportsAnalyticsView: React.FC = () => {
  // Navigation Tabs inside Reports
  const [activeTab, setActiveTab] = useState<'financial' | 'inventory_valuation' | 'movers_audit'>('financial');

  // Date Filters for Financial Report
  const [dateFilter, setDateFilter] = useState<'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'all'>('all');
  const [customStart, setCustomStart] = useState<string>('2026-01-01');
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().split('T')[0]);

  // Data States
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null);
  const [valuationReport, setValuationReport] = useState<StockValuationReport | null>(null);
  const [moversData, setMoversData] = useState<{ topItems: TopItem[]; stagnantItems: StagnantItem[] } | null>(null);
  const [auditData, setAuditData] = useState<{ users: UserAccount[]; auditLogs: AuditLogs } | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [auditSubTab, setAuditSubTab] = useState<'movers' | 'price_changes' | 'voids' | 'users'>('movers');

  // Compute start/end date based on filter
  const getDateRange = (filter: string) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (filter === 'today') {
      return { start: todayStr, end: todayStr };
    } else if (filter === 'last7') {
      const d = new Date();
      d.setDate(today.getDate() - 7);
      return { start: d.toISOString().split('T')[0], end: todayStr };
    } else if (filter === 'thisMonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      return { start, end: todayStr };
    } else if (filter === 'lastMonth') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
      const end = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
      return { start, end };
    }
    return { start: '2026-01-01', end: todayStr };
  };

  // 1. Load Financial Report
  const loadFinancial = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const { start, end } = getDateRange(dateFilter);
        const data = await window.electronAPI.getFinancialReport(start, end);
        setFinancialReport(data);
      }
    } catch (err) {
      console.error('Failed to load financial report:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  // 2. Load Valuation & Expiry
  const loadValuation = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getExpiryAndStockValuationReport();
        setValuationReport(data);
      }
    } catch (err) {
      console.error('Failed to load stock valuation report:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 3. Load Movers & Audit
  const loadMoversAndAudit = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const [movers, audit] = await Promise.all([
          window.electronAPI.getTopMovingAndStagnantItems(15),
          window.electronAPI.getUsersAndAuditLogs(40)
        ]);
        setMoversData(movers);
        setAuditData(audit);
      }
    } catch (err) {
      console.error('Failed to load movers & audit data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'financial') loadFinancial();
    else if (activeTab === 'inventory_valuation') loadValuation();
    else if (activeTab === 'movers_audit') loadMoversAndAudit();
  }, [activeTab, loadFinancial, loadValuation, loadMoversAndAudit]);

  // Export CSV
  const handleExportCSV = () => {
    if (!financialReport) return;
    const headers = 'التاريخ,المبيعات,الأرباح,المصروفات\n';
    const rows = financialReport.daily_breakdown
      .map(d => `${d.date},${d.sales},${d.profit},${d.expenses}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_الأرباح_اليومي_${financialReport.startDate}_${financialReport.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 font-sans pb-8 select-none">
      {/* 1. Top Header Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  التقارير المالية والرقابية الشاملة وتقييم المخزون
                </h1>
                <kbd className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-300">
                  F6
                </kbd>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تحليلات الأرباح، تقييم بضاعة المخزن، تواريخ الصلاحية الحرجة، وسجل الرقابة وتغيرات الأسعار.
              </p>
            </div>
          </div>

          {/* Subtabs Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setActiveTab('financial')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'financial'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>الأرباح والمبيعات واليوميات</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory_valuation')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'inventory_valuation'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>تقييم المخزون وتواريخ الصلاحية</span>
            </button>

            <button
              onClick={() => setActiveTab('movers_audit')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'movers_audit'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>الأكثر مبيعاً والرواكد والرقابة</span>
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: FINANCIAL PERFORMANCE                             */}
      {/* ======================================================== */}
      {activeTab === 'financial' && (
        <div className="space-y-3">
          {/* Date Filter Strip */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700 ml-1">الفترة الزمنية:</span>
              {(['today', 'last7', 'thisMonth', 'lastMonth', 'all'] as const).map((filterKey) => {
                const label = filterKey === 'today' ? 'اليوم' : filterKey === 'last7' ? 'آخر 7 أيام' : filterKey === 'thisMonth' ? 'هذا الشهر' : filterKey === 'lastMonth' ? 'الشهر الماضي' : 'سجل 2026 كاملاً';
                return (
                  <button
                    key={filterKey}
                    onClick={() => setDateFilter(filterKey)}
                    className={`px-3 py-1 rounded-lg font-bold border transition-all ${
                      dateFilter === filterKey
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 transition-colors"
                title="تصدير جدول اليوميات إلى ملف CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>تصدير CSV</span>
              </button>

              <button
                onClick={loadFinancial}
                disabled={loading}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Key KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {/* 1. Total Sales */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
              <span className="text-slate-500 font-bold block text-[11px]">إجمالي المبيعات</span>
              <strong className="text-lg font-mono font-extrabold text-blue-700 block mt-1">
                {financialReport?.total_sales.toFixed(2) || '0.00'}
              </strong>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                {financialReport?.invoices_count || 0} فاتورة بيع
              </span>
            </div>

            {/* 2. COGS */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
              <span className="text-slate-500 font-bold block text-[11px]">تكلفة البضاعة المباعة (COGS)</span>
              <strong className="text-lg font-mono font-extrabold text-slate-800 block mt-1">
                {financialReport?.cogs.toFixed(2) || '0.00'}
              </strong>
              <span className="text-[10px] text-slate-400 mt-1 block">
                سعر التكلفة للأصناف المباعة
              </span>
            </div>

            {/* 3. Gross Profit & Margin */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
              <span className="text-slate-500 font-bold block text-[11px]">مجمل الربح (Gross Profit)</span>
              <strong className="text-lg font-mono font-extrabold text-emerald-600 block mt-1">
                +{financialReport?.gross_profit.toFixed(2) || '0.00'}
              </strong>
              <span className="text-[10px] text-emerald-700 font-bold mt-1 block">
                هامش ربح {financialReport?.gross_margin_pct || 0}%
              </span>
            </div>

            {/* 4. Total Purchases */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
              <span className="text-slate-500 font-bold block text-[11px]">إجمالي المشتريات الموردة</span>
              <strong className="text-lg font-mono font-extrabold text-slate-800 block mt-1">
                {financialReport?.total_purchases.toFixed(2) || '0.00'}
              </strong>
              <span className="text-[10px] text-slate-400 mt-1 block">
                فواتير الشركات الـ 17
              </span>
            </div>

            {/* 5. Operating Expenses */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
              <span className="text-slate-500 font-bold block text-[11px]">المصروفات التشغيلية</span>
              <strong className="text-lg font-mono font-extrabold text-rose-600 block mt-1">
                -{financialReport?.total_expenses.toFixed(2) || '0.00'}
              </strong>
              <span className="text-[10px] text-slate-400 mt-1 block">
                رواتب، كهرباء، إيجار، نثريات
              </span>
            </div>

            {/* 6. Net Profit */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-xl p-3.5 shadow-2xs">
              <span className="text-emerald-100 font-bold block text-[11px]">صافي الربح التشغيلي</span>
              <strong className="text-lg font-mono font-extrabold block mt-1">
                +{financialReport?.net_profit.toFixed(2) || '0.00'}
              </strong>
              <span className="text-[10px] text-emerald-100/90 mt-1 block">
                مجمل الربح - المصروفات
              </span>
            </div>
          </div>

          {/* Daily Breakdown Table */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-xs font-bold text-slate-800">
                سجل اليوميات المالية التفصيلية لعمليات الصيدلية
              </span>
              <span className="text-xs text-slate-500 font-mono">
                الفترة من {financialReport?.startDate} إلى {financialReport?.endDate}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-3 w-32 text-center">التاريخ</th>
                    <th className="py-2.5 px-3 text-left">مبيعات اليوم (ج.م)</th>
                    <th className="py-2.5 px-3 text-left">أرباح اليوم التقديرية</th>
                    <th className="py-2.5 px-3 text-left">مصروفات اليوم المسجلة</th>
                    <th className="py-2.5 px-3 text-left">صافي أداء اليوم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
                        <span>جاري تحميل بيانات التقرير المالي...</span>
                      </td>
                    </tr>
                  ) : !financialReport || financialReport.daily_breakdown.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        لا توجد حركات بيع مسجلة خلال هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    financialReport.daily_breakdown.map((row) => {
                      const net = row.profit - row.expenses;
                      return (
                        <tr key={row.date} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-700">
                            {row.date}
                          </td>
                          <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                            {row.sales.toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-left font-mono font-bold text-emerald-600">
                            +{row.profit.toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-left font-mono text-rose-600">
                            {row.expenses > 0 ? `-${row.expenses.toFixed(2)} ج.م` : '-'}
                          </td>
                          <td className="py-2 px-3 text-left font-mono font-extrabold text-blue-700">
                            {net.toFixed(2)} ج.م
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: INVENTORY VALUATION & EXPIRY AUDIT                 */}
      {/* ======================================================== */}
      {activeTab === 'inventory_valuation' && (
        <div className="space-y-3">
          {/* Valuation KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Total In-Stock Items */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
              <span className="text-slate-500 font-bold block text-[11px]">الأصناف المتوفرة بالرصيد</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-extrabold font-mono text-slate-900">
                  {valuationReport?.total_in_stock_items.toLocaleString('en-US') || '1,877'}
                </span>
                <span className="text-xs text-slate-400 font-sans">صنف</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                إجمالي {valuationReport?.total_pieces.toLocaleString('en-US')} عبوة/شريط بالمخزن
              </span>
            </div>

            {/* Valuation at Cost */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
              <span className="text-slate-500 font-bold block text-[11px]">قيمة البضاعة بسعر الشراء (التكلفة)</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-extrabold font-mono text-slate-900">
                  {valuationReport?.total_cost_value.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                </span>
                <span className="text-xs text-slate-500 font-sans">ج.م</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                رأس المال الفعلي المجمد في البضاعة
              </span>
            </div>

            {/* Valuation at Consumer Price */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
              <span className="text-slate-500 font-bold block text-[11px]">قيمة البضاعة بسعر بيع الجمهور</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-extrabold font-mono text-blue-700">
                  {valuationReport?.total_consumer_value.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                </span>
                <span className="text-xs text-slate-500 font-sans">ج.م</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                العائد المتوقع عند بيع كامل المخزون
              </span>
            </div>

            {/* Potential Profit */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl p-4 shadow-2xs">
              <span className="text-blue-100 font-bold block text-[11px]">الربح الكامن في المخزون المتوفر</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-extrabold font-mono">
                  +{valuationReport?.potential_profit.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                </span>
                <span className="text-xs text-blue-100 font-sans">ج.م</span>
              </div>
              <span className="text-[10px] text-blue-100/90 mt-1 block">
                فارق السعر بين الشراء والجمهور
              </span>
            </div>
          </div>

          {/* Expiry Risk Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-rose-800 block text-xs">أصناف منتهية الصلاحية (Expired)</span>
                <span className="text-[11px] text-rose-600">يجب استبعادها وإرجاعها للشركة فوراً</span>
              </div>
              <span className="text-lg font-mono font-extrabold text-rose-800">
                {valuationReport?.expired_count || 0}
              </span>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-amber-800 block text-xs">حرجة: تنتهي خلال 3 أشهر</span>
                <span className="text-[11px] text-amber-600">أولوية الصرف بالروشتات</span>
              </div>
              <span className="text-lg font-mono font-extrabold text-amber-800">
                {valuationReport?.near_expiry_3m_count || 0}
              </span>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-blue-800 block text-xs">تحذيرية: تنتهي خلال 6 أشهر</span>
                <span className="text-[11px] text-blue-600">متابعة الرصيد لمنع الركود</span>
              </div>
              <span className="text-lg font-mono font-extrabold text-blue-800">
                {valuationReport?.near_expiry_6m_count || 0}
              </span>
            </div>
          </div>

          {/* Near Expiry Items Table */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-xs font-bold text-slate-800">
                قائمة الأدوية المراقبة وشيكة الانتهاء (أحدث {valuationReport?.near_expiry_items.length || 0} صنفاً)
              </span>
              <button
                onClick={loadValuation}
                disabled={loading}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>تحديث الفحص</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-3 w-16 text-center">كود</th>
                    <th className="py-2.5 px-3 min-w-[220px]">اسم الدواء التجاري</th>
                    <th className="py-2.5 px-3 w-28 text-center">تاريخ الصلاحية</th>
                    <th className="py-2.5 px-3 w-24 text-center">الرصيد بالمخزن</th>
                    <th className="py-2.5 px-3 w-24 text-left">سعر الجمهور</th>
                    <th className="py-2.5 px-3 w-24 text-left">سعر التكلفة</th>
                    <th className="py-2.5 px-3 w-28 text-center">درجة التحذير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!valuationReport || valuationReport.near_expiry_items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5" />
                        <p className="font-semibold text-slate-700">لا توجد أدوية وشيكة الانتهاء حالياً</p>
                        <p className="text-xs text-slate-400">تواريخ صلاحية المخزون آمنة ومحدثة.</p>
                      </td>
                    </tr>
                  ) : (
                    valuationReport.near_expiry_items.map((item) => (
                      <tr key={item.item_id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                          #{item.item_id}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {item.item_name_en}
                          {item.item_name_ar && (
                            <span className="block text-[11px] text-slate-500 font-sans mt-0.5">
                              {item.item_name_ar}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-rose-700">
                          {item.expiry_date}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                          {item.current_stock}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                          {item.consumer_price.toFixed(2)} ج.م
                        </td>
                        <td className="py-2 px-3 text-left font-mono text-slate-600">
                          {item.buy_price.toFixed(2)} ج.م
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.urgency === 'EXPIRED'
                              ? 'bg-rose-100 text-rose-800'
                              : item.urgency === 'CRITICAL'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {item.urgency === 'EXPIRED' ? 'منتهي الصلاحية' : item.urgency === 'CRITICAL' ? 'حرج (< 3 أشهر)' : 'تحذير (< 6 أشهر)'}
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
      {/* TAB 3: TOP MOVERS, STAGNANT & AUDIT LOGS                 */}
      {/* ======================================================== */}
      {activeTab === 'movers_audit' && (
        <div className="space-y-3">
          {/* Sub Switcher */}
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200/90 p-2 shadow-2xs">
            <button
              onClick={() => setAuditSubTab('movers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                auditSubTab === 'movers' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              الأصناف الأكثر مبيعاً والرواكد
            </button>
            <button
              onClick={() => setAuditSubTab('price_changes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                auditSubTab === 'price_changes' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              سجل تعديلات الأسعار (18,627+)
            </button>
            <button
              onClick={() => setAuditSubTab('voids')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                auditSubTab === 'voids' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              سجل المرتجعات والحركات الملغاة (7,920+)
            </button>
            <button
              onClick={() => setAuditSubTab('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                auditSubTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              طاقم الصيدلية والصلاحيات ({auditData?.users.length || 0})
            </button>
          </div>

          {/* Sub 1: Top Movers & Stagnant */}
          {auditSubTab === 'movers' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Top Moving Items */}
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-emerald-50/60 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>الأصناف الأكثر طلباً ومبيعاً (Top Movers)</span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2 px-3">اسم الدواء</th>
                        <th className="py-2 px-3 text-center">الكمية المباعة</th>
                        <th className="py-2 px-3 text-left">الإيراد</th>
                        <th className="py-2 px-3 text-center">المخزون الحالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {moversData?.topItems.map((item) => (
                        <tr key={item.item_id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-900">
                            {item.item_name_en}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-emerald-700">
                            {item.total_quantity_sold}
                          </td>
                          <td className="py-2 px-3 text-left font-mono font-bold text-slate-800">
                            {item.total_revenue.toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-600">
                            {item.current_stock}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stagnant Items */}
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-amber-50/60 flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>الأصناف الراكدة المتوفرة بالمخزن (Stagnant Items)</span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2 px-3">اسم الصنف</th>
                        <th className="py-2 px-3 text-center">الرصيد المجمد</th>
                        <th className="py-2 px-3 text-left">سعر الجمهور</th>
                        <th className="py-2 px-3">الشركة المنتجة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {moversData?.stagnantItems.map((item) => (
                        <tr key={item.item_id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-900">
                            {item.item_name_en}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-amber-800">
                            {item.current_stock}
                          </td>
                          <td className="py-2 px-3 text-left font-mono text-slate-800">
                            {item.consumer_price.toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-slate-500 text-[11px]">
                            {item.producer || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Sub 2: Price Changes Log */}
          {auditSubTab === 'price_changes' && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-slate-50/60">
                <span className="text-xs font-bold text-slate-800">
                  سجل تتبع التغيرات السعرية للأدوية (`price_change_history`)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2 px-3 w-16 text-center">رقم #</th>
                      <th className="py-2 px-3 min-w-[220px]">اسم الدواء</th>
                      <th className="py-2 px-3 w-28 text-left">السعر القديم</th>
                      <th className="py-2 px-3 w-28 text-left">السعر الجديد</th>
                      <th className="py-2 px-3 w-28 text-center">نسبة الزيادة</th>
                      <th className="py-2 px-3 w-40 text-center">وقت التعديل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditData?.auditLogs.price_changes.map((log) => {
                      const diff = log.new_price - log.old_price;
                      return (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                            #{log.id}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">
                            {log.item_name_en}
                          </td>
                          <td className="py-2 px-3 text-left font-mono line-through text-slate-400">
                            {log.old_price.toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-left font-mono font-bold text-blue-700">
                            {log.new_price.toFixed(2)} ج.م
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-[11px] font-bold text-emerald-600">
                            {diff > 0 ? `+${diff.toFixed(2)} ج.م` : `${diff.toFixed(2)} ج.م`}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-600">
                            {log.changed_at}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub 3: Undo & Voids Log */}
          {auditSubTab === 'voids' && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-slate-50/60">
                <span className="text-xs font-bold text-slate-800">
                  سجل عمليات المرتجعات والحركات الملغاة (`undo_sales_history`)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2 px-3 w-16 text-center">رقم #</th>
                      <th className="py-2 px-3 w-36 text-center">الوقت والتاريخ</th>
                      <th className="py-2 px-3 min-w-[200px]">الصنف المرتجع</th>
                      <th className="py-2 px-3 w-32">المستخدم / الكاشير</th>
                      <th className="py-2 px-3 w-28 text-left">قيمة المرتجع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditData?.auditLogs.voids_and_returns.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                          #{v.id}
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-600">
                          {v.sale_timestamp}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {v.item_name}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {v.user_name}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-rose-700">
                          {v.unit_price.toFixed(2)} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub 4: Pharmacy Staff & Permissions */}
          {auditSubTab === 'users' && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-slate-50/60">
                <span className="text-xs font-bold text-slate-800">
                  سجل طاقم الصيدلية وحسابات المستخدمين (`users`)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
                {auditData?.users.map((u) => (
                  <div key={u.user_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                        {u.user_name.charAt(0)}
                      </div>
                      <div>
                        <strong className="text-xs text-slate-900 block">{u.user_name}</strong>
                        <span className="text-[10px] text-slate-400 font-mono">ID: #{u.user_id}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      u.is_active === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {u.is_active === 1 ? 'نشط' : 'معطل'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
