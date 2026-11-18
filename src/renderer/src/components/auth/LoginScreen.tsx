import React, { useState, useEffect, useRef } from 'react';
import { AuthSession, UserAccount, UserRole } from '../../../../shared/types';
import { Lock, ShieldCheck, UserCheck, KeyRound, Delete, Pill, X } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (session: AuthSession) => void;
  onCancelSwitch?: () => void;
  canCancel?: boolean;
}

const ROLE_LABELS: Record<UserRole, { text: string; badgeClass: string }> = {
  ADMIN: { text: 'مدير الصيدلية', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' },
  PHARMACIST: { text: 'صيدلي مسؤول', badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-400/30' },
  CASHIER: { text: 'كاشير مبيعات', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/30' }
};

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onCancelSwitch,
  canCancel = false
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [badgeOrIdInput, setBadgeOrIdInput] = useState<string>('');
  const [pinCode, setPinCode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsers(true);
    window.electronAPI
      ?.listActiveUsers()
      .then((list) => {
        if (cancelled) return;
        const active = list || [];
        setUsers(active);
        if (active.length > 0) {
          setSelectedUserId(active[0].user_id);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'تعذر تحميل قائمة المستخدمين.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setTimeout(() => pinInputRef.current?.focus(), 60);
  }, [selectedUserId]);

  const handleDigitClick = (digit: string) => {
    setErrorMsg('');
    setPinCode((prev) => (prev.length < 8 ? prev + digit : prev));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetKey = badgeOrIdInput.trim() || (selectedUserId !== null ? String(selectedUserId) : '');
    if (!targetKey) {
      setErrorMsg('يرجى اختيار الموظف أو مسح باركود الكارنيه.');
      return;
    }
    if (!pinCode.trim()) {
      setErrorMsg('يرجى إدخال كود الدخول (PIN).');
      pinInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const session = await window.electronAPI.authenticateUser(targetKey, pinCode.trim());
      onLoginSuccess(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg.replace(/^Error invoking remote method.*?:\s*Error:\s*/i, ''));
      setPinCode('');
      pinInputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const selectedUser = users.find((u) => u.user_id === selectedUserId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans select-none"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #064e3b 100%)' }}
      data-modal-open="true"
      dir="rtl"
    >
      <div className="w-full max-w-4xl bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 text-white">
        {/* Right Column: User Selection */}
        <div className="md:col-span-7 p-6 border-b md:border-b-0 md:border-l border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Pill className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">صيدلية د. مريم الحميلي</h1>
                  <p className="text-xs text-slate-400">تسجيل دخول الطاقم وتأمين الصلاحيات</p>
                </div>
              </div>
              {canCancel && onCancelSwitch && (
                <button
                  type="button"
                  onClick={onCancelSwitch}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  title="العودة للجلسة الحالية"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <label className="block text-xs font-bold text-slate-300 mb-2">
              اختر الموظف:
            </label>

            {loadingUsers ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-800/40 rounded-xl">
                جاري تحميل طاقم الصيدلية...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-0.5">
                {users.map((u) => {
                  const role = (u.role as UserRole) || 'CASHIER';
                  const roleMeta = ROLE_LABELS[role] || ROLE_LABELS.CASHIER;
                  const isSelected = selectedUserId === u.user_id && !badgeOrIdInput.trim();
                  return (
                    <button
                      key={u.user_id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u.user_id);
                        setBadgeOrIdInput('');
                        setErrorMsg('');
                      }}
                      className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-400 ring-1 ring-emerald-400/50'
                          : 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                          isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200'
                        }`}>
                          {u.user_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{u.user_name}</div>
                          <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${roleMeta.badgeClass}`}>
                            {roleMeta.text}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">#{u.user_id}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                أو امسح باركود كارنيه الموظف (مثال EMP-3):
              </label>
              <input
                type="text"
                value={badgeOrIdInput}
                onChange={(e) => {
                  setBadgeOrIdInput(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="EMP-..."
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:border-emerald-400 outline-none"
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>الخزينة والتكلفة محمية حسب الصلاحية</span>
            </span>
            <span className="font-mono">RBAC v2</span>
          </div>
        </div>

        {/* Left Column: PIN Pad & Login Action */}
        <form onSubmit={handleSubmit} className="md:col-span-5 p-6 bg-slate-950/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-200">
                {badgeOrIdInput.trim()
                  ? `الدخول بالكارنيه: ${badgeOrIdInput.trim()}`
                  : selectedUser
                    ? `كود الدخول لـ: ${selectedUser.user_name}`
                    : 'أدخل الرقم السري (PIN)'}
              </span>
            </div>

            <div className="relative mb-3">
              <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                ref={pinInputRef}
                type="password"
                inputMode="numeric"
                value={pinCode}
                onChange={(e) => {
                  setErrorMsg('');
                  setPinCode(e.target.value);
                }}
                placeholder="••••"
                dir="ltr"
                className="w-full pr-9 pl-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-400 text-center font-mono text-lg font-bold tracking-[0.4em] text-white outline-none"
              />
            </div>

            {/* Numeric Touch Keypad */}
            <div className="grid grid-cols-3 gap-2 mb-3" dir="ltr">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDigitClick(d)}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 font-mono text-sm font-bold text-white transition-colors cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPinCode('');
                  setErrorMsg('');
                }}
                className="py-2.5 rounded-xl bg-slate-800/70 hover:bg-rose-950/60 border border-slate-700/80 text-xs font-bold text-rose-300 transition-colors cursor-pointer"
              >
                مسح
              </button>
              <button
                type="button"
                onClick={() => handleDigitClick('0')}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 font-mono text-sm font-bold text-white transition-colors cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinCode((p) => p.slice(0, -1))}
                className="py-2.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 border border-slate-700/80 flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                title="حذف رقم"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-medium text-center">
                {errorMsg}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>{submitting ? 'جاري التحقق...' : 'دخول للنظام'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
