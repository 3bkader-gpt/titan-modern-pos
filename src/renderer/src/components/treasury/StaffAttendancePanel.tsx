import React, { useState, useEffect, useCallback } from 'react';
import { StaffAttendanceLog } from '../../../../shared/types';
import { 
  Barcode, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Calendar, 
  KeyRound, 
  ArrowRightLeft,
  UserCheck
} from 'lucide-react';

export const StaffAttendancePanel: React.FC = () => {
  const [badgeInput, setBadgeInput] = useState<string>('');
  const [pinCode, setPinCode] = useState<string>('');
  const [logs, setLogs] = useState<StaffAttendanceLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.getStaffAttendanceLogs) {
        const data = await window.electronAPI.getStaffAttendanceLogs();
        setLogs(data || []);
      }
    } catch (err) {
      console.error('Failed to load attendance logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const barcode = badgeInput.trim();
    if (!barcode) {
      setAlert({ type: 'error', message: 'يرجى مسح باركود الموظف أو كتابة المعرّف.' });
      return;
    }

    setSubmitting(true);
    setAlert(null);
    try {
      if (window.electronAPI?.clockStaffAttendance) {
        const res = await window.electronAPI.clockStaffAttendance(barcode, pinCode.trim() || undefined);
        setAlert({
          type: res.success ? 'success' : 'error',
          message: res.message
        });
        setBadgeInput('');
        setPinCode('');
        await loadLogs();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlert({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Clocking Station Card */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-2xl p-6 shadow-lg border border-blue-600/30">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-xl border border-white/20">
              <Barcode className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">محطة الحضور والانصراف بالباركود للكادر الطبي</h3>
              <p className="text-xs text-blue-200 mt-0.5">امسح كارنيه الموظف بالماسح الضوئي لتسجيل الدخول أو الخروج تلقائياً</p>
            </div>
          </div>
          <div className="text-xs bg-white/10 px-3 py-1.5 rounded-lg border border-white/15 text-blue-100 flex items-center gap-1.5 font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>نظام احتساب الدقائق التلقائي</span>
          </div>
        </div>

        {alert && (
          <div className={`p-3 rounded-xl mb-4 text-xs font-bold flex items-center gap-2 border ${
            alert.type === 'success' 
              ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-100' 
              : 'bg-rose-500/20 border-rose-400/30 text-rose-100'
          }`}>
            {alert.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
            )}
            <span>{alert.message}</span>
          </div>
        )}

        <form onSubmit={handleClock} className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-2xs text-blue-200 font-semibold mb-1">باركود الكارنيه أو معرّف الموظف (ID)</label>
            <div className="relative">
              <input
                type="text"
                value={badgeInput}
                onChange={(e) => setBadgeInput(e.target.value)}
                placeholder="امسح بالباركود أو اكتب EMP-..."
                autoFocus
                className="w-full bg-white text-slate-800 placeholder-slate-400 rounded-xl px-4 py-2.5 text-xs font-mono font-bold outline-none border border-transparent focus:border-blue-400 shadow-inner"
              />
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div className="w-32">
            <label className="block text-2xs text-blue-200 font-semibold mb-1">كود PIN (اختياري)</label>
            <div className="relative">
              <input
                type="password"
                maxLength={6}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="****"
                className="w-full bg-white text-slate-800 placeholder-slate-400 rounded-xl px-4 py-2.5 text-xs font-mono font-bold outline-none border border-transparent focus:border-blue-400 shadow-inner"
              />
              <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div className="self-end">
            <button
              type="submit"
              disabled={submitting || !badgeInput.trim()}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightLeft className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
              <span>تسجيل دخول / خروج</span>
            </button>
          </div>
        </form>
      </div>

      {/* Attendance History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-bold text-slate-700">سجل الحضور والانصراف الأخير</h4>
          </div>
          <button
            onClick={loadLogs}
            disabled={loading}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="تحديث"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">الموظف</th>
                <th className="py-3 px-3">التاريخ</th>
                <th className="py-3 px-3">وقت الحضور</th>
                <th className="py-3 px-3">وقت الانصراف</th>
                <th className="py-3 px-3 text-center">دقائق العمل</th>
                <th className="py-3 px-3 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    لا توجد تسجيلات حضور أو انصراف حالياً.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isOpen = !log.check_out_at;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-blue-600" />
                          <span>{log.user_name}</span>
                          <span className="text-2xs text-slate-400 font-mono">#{log.user_id}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">{log.work_date}</td>
                      <td className="py-3 px-3 font-mono text-emerald-700 font-medium">{log.check_in_at}</td>
                      <td className="py-3 px-3 font-mono text-slate-700">
                        {log.check_out_at ? log.check_out_at : <span className="text-amber-600 font-bold">قيد العمل حالياً</span>}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">
                        {log.worked_minutes > 0 ? `${log.worked_minutes} دقيقة` : '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                          isOpen ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isOpen ? 'متواجد بالصيدلية' : 'تم الانصراف'}
                        </span>
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
  );
};
