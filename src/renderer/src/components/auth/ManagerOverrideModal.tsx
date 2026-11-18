import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, KeyRound, CheckCircle2, X } from 'lucide-react';

interface ManagerOverrideModalProps {
  isOpen: boolean;
  currentUserId: number;
  actionLabel: string;
  targetRef?: string;
  details?: string;
  onClose: () => void;
  onAuthorized: (result: { managerId: number; managerName: string; pinCode: string }) => void;
}

export const ManagerOverrideModal: React.FC<ManagerOverrideModalProps> = ({
  isOpen,
  currentUserId,
  actionLabel,
  targetRef = '',
  details,
  onClose,
  onAuthorized
}) => {
  const [pinCode, setPinCode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPinCode('');
      setErrorMsg('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pinCode.trim();
    if (!cleanPin) {
      setErrorMsg('يرجى إدخال الرقم السري للمدير.');
      return;
    }

    setVerifying(true);
    setErrorMsg('');
    try {
      const res = await window.electronAPI.verifyManagerOverride(
        cleanPin,
        currentUserId,
        actionLabel,
        targetRef
      );
      if (res.ok) {
        onAuthorized({
          managerId: res.managerId,
          managerName: res.managerName,
          pinCode: cleanPin
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg.replace(/^Error invoking remote method.*?:\s*Error:\s*/i, ''));
      setPinCode('');
      inputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 font-sans"
      data-modal-open="true"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">الدخول كمدير (تفويض عملية مقيدة)</h3>
              <p className="text-[11px] text-amber-800">
                تظل السلة وجلستك مفتوحة — التفويض لهذه العملية فقط
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-amber-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">العملية المطلوبة:</span>
              <strong className="text-slate-900">{actionLabel}</strong>
            </div>
            {targetRef && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">المرجع:</span>
                <span className="font-mono text-slate-700">{targetRef}</span>
              </div>
            )}
            {details && (
              <p className="text-[11px] text-amber-700 pt-1 border-t border-slate-200">{details}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الرقم السري للمدير (Manager PIN):
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                value={pinCode}
                onChange={(e) => {
                  setErrorMsg('');
                  setPinCode(e.target.value);
                }}
                placeholder="أدخل PIN المدير"
                dir="ltr"
                className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-300 focus:border-amber-500 text-center font-mono text-base font-bold tracking-widest outline-none"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{verifying ? 'جاري التفويض...' : 'اعتماد وتنفيذ'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
