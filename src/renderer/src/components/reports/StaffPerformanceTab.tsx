import React, { useState, useEffect, useCallback } from 'react';
import { StaffPerformanceItem } from '../../../../shared/types';
import { 
  Users, 
  Calendar, 
  RefreshCw, 
  Award, 
  Clock, 
  Barcode, 
  Printer, 
  Search, 
  TrendingUp, 
  DollarSign, 
  FileText 
} from 'lucide-react';

export const StaffPerformanceTab: React.FC = () => {
  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [fromDate, setFromDate] = useState<string>(currentMonthStart);
  const [toDate, setToDate] = useState<string>(today);
  const [items, setItems] = useState<StaffPerformanceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStaffForBadge, setSelectedStaffForBadge] = useState<StaffPerformanceItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.getStaffSalesAndIncentivesReport) {
        const data = await window.electronAPI.getStaffSalesAndIncentivesReport(fromDate, toDate);
        setItems(data || []);
      }
    } catch (err) {
      console.error('Failed to load staff performance report:', err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregate totals
  const totalSales = items.reduce((acc, i) => acc + i.total_sales_amount, 0);
  const totalCommissions = items.reduce((acc, i) => acc + i.commission_amount, 0);
  const totalInvoices = items.reduce((acc, i) => acc + i.sales_count, 0);
  const totalHours = items.reduce((acc, i) => acc + i.worked_hours, 0);

  const handlePrintBadge = (staff: StaffPerformanceItem) => {
    setSelectedStaffForBadge(staff);
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">تقرير أداء العاملين والعمولات وحافز الأصناف</h3>
            <p className="text-xs text-slate-500">حساب المبيعات، المرتجعات، عمولة المبيعات وبونص الأصناف المحددة</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 font-medium">من:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent font-mono text-slate-700 outline-none text-xs"
            />
            <span className="text-slate-500 font-medium mr-2">إلى:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent font-mono text-slate-700 outline-none text-xs"
            />
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث التقرير</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>إجمالي مبيعات الفترة</span>
          </div>
          <div className="text-xl font-extrabold text-slate-800 font-mono">
            {totalSales.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            <span className="text-xs font-normal text-slate-400">ج.م</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <Award className="w-4 h-4 text-amber-500" />
            <span>إجمالي العمولات والحوافز</span>
          </div>
          <div className="text-xl font-extrabold text-amber-600 font-mono">
            {totalCommissions.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            <span className="text-xs font-normal text-slate-400">ج.م</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>إجمالي الفواتير الصادرة</span>
          </div>
          <div className="text-xl font-extrabold text-slate-800 font-mono">
            {totalInvoices}{' '}
            <span className="text-xs font-normal text-slate-400">فاتورة</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>ساعات العمل المسجلة</span>
          </div>
          <div className="text-xl font-extrabold text-indigo-600 font-mono">
            {totalHours.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">ساعة</span>
          </div>
        </div>
      </div>

      {/* Staff Performance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-700">جدول تقييم واستحقاقات الكادر الطبي والإداري</h4>
          <span className="text-2xs text-slate-400">يشمل عمولة المبيعات والحافز الفردي على الأصناف</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">الموظف / الصيدلي</th>
                <th className="py-3 px-3">الدور الوظيفي</th>
                <th className="py-3 px-3">باركود الكارنيه</th>
                <th className="py-3 px-3 text-center">عدد الفواتير</th>
                <th className="py-3 px-3 text-left">إجمالي المبيعات</th>
                <th className="py-3 px-3 text-left">المرتجعات</th>
                <th className="py-3 px-3 text-left">صافي المبيعات</th>
                <th className="py-3 px-3 text-left">العمولة والحافز</th>
                <th className="py-3 px-3 text-center">ساعات الحضور</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                    لا توجد بيانات مبيعات أو حضور مسجلة خلال الفترة المختارة.
                  </td>
                </tr>
              ) : (
                items.map((staff) => (
                  <tr key={staff.user_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                          {staff.user_name.charAt(0)}
                        </div>
                        <div>
                          <span>{staff.user_name}</span>
                          <span className="block text-2xs text-slate-400 font-mono">#{staff.user_id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                        staff.role === 'ADMIN' 
                          ? 'bg-purple-100 text-purple-700' 
                          : staff.role === 'PHARMACIST' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-blue-100 text-blue-700'
                      }`}>
                        {staff.role === 'ADMIN' ? 'مدير نظام' : staff.role === 'PHARMACIST' ? 'صيدلي' : 'كاشير'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {staff.badge_barcode || `EMP-${staff.user_id}`}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                      {staff.sales_count}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-medium text-slate-700">
                      {staff.total_sales_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-rose-600">
                      {staff.total_returns_amount > 0 ? `-${staff.total_returns_amount.toFixed(2)}` : '0.00'}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-bold text-slate-800">
                      {staff.net_sales_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-left font-mono font-bold text-amber-600 bg-amber-50/50">
                      {staff.commission_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                      <span className="text-2xs font-normal text-amber-700">ج.م</span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-700">
                      {staff.worked_hours} س
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handlePrintBadge(staff)}
                        className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg transition-colors border border-slate-200"
                        title="طباعة كارنيه الباركود"
                      >
                        <Barcode className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff ID Badge Modal */}
      {selectedStaffForBadge && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center">
            <h3 className="text-sm font-bold text-slate-800 mb-1">كارنيه الحضور والانصراف بالباركود</h3>
            <p className="text-xs text-slate-500 mb-4">صيدلية د. مريم الحميلي</p>

            {/* Badge Card preview */}
            <div className="border-2 border-dashed border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white rounded-xl p-6 mb-5 shadow-xs">
              <div className="w-16 h-16 rounded-full bg-indigo-600 text-white font-extrabold text-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
                {selectedStaffForBadge.user_name.charAt(0)}
              </div>
              <div className="font-bold text-base text-slate-800">{selectedStaffForBadge.user_name}</div>
              <div className="text-xs font-semibold text-indigo-600 mb-4">
                {selectedStaffForBadge.role === 'ADMIN' ? 'مدير الصيدلية' : selectedStaffForBadge.role === 'PHARMACIST' ? 'دكتور صيدلي' : 'كاشير ومبيعات'}
              </div>

              {/* Barcode representation */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 font-mono text-center">
                <div className="text-xs tracking-widest text-slate-400 mb-1">BARCODE CODE-128</div>
                <div className="text-lg font-bold text-slate-900 tracking-wider">
                  {selectedStaffForBadge.badge_barcode || `EMP-${selectedStaffForBadge.user_id}`}
                </div>
                <div className="h-10 bg-slate-800 rounded mt-1 flex items-center justify-center text-white text-2xs tracking-widest">
                  ||||| | |||| ||| |||| | |||||
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الكارنيه</span>
              </button>
              <button
                onClick={() => setSelectedStaffForBadge(null)}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
