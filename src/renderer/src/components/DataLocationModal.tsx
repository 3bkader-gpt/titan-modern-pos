import React, { useState, useEffect } from 'react';
import { StorageInfo, ChangeDataDirResult } from '../../../shared/types';
import {
  FolderOpen,
  Database,
  HardDrive,
  CheckCircle2,
  X,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

interface DataLocationModalProps {
  isOpen: boolean;
  isFirstRunSetup: boolean;
  storageInfo: StorageInfo | null;
  onClose: () => void;
  onUpdated: (info: StorageInfo, message?: string) => void;
}

export const DataLocationModal: React.FC<DataLocationModalProps> = ({
  isOpen,
  isFirstRunSetup,
  storageInfo,
  onClose,
  onUpdated
}) => {
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setBusy(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!busy && !isFirstRunSetup) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, busy, isFirstRunSetup, onClose]);

  if (!isOpen) return null;

  const handleChooseDirectory = async () => {
    if (!window.electronAPI || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res: ChangeDataDirResult = await window.electronAPI.chooseDataDirectory();
      if (res.canceled) {
        return;
      }
      if (!res.success) {
        setError(res.message || 'تعذر تغيير مجلد حفظ البيانات.');
        return;
      }
      const updatedInfo = await window.electronAPI.getStorageInfo();
      onUpdated(updatedInfo, res.message || 'تم اعتماد مجلد حفظ البيانات بنجاح.');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`حدث خطأ أثناء تغيير المسار: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCurrent = async () => {
    if (!window.electronAPI || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updatedInfo = await window.electronAPI.confirmCurrentDataDirectory();
      onUpdated(updatedInfo, 'تم تأكيد واعتماد مجلد حفظ البيانات بنجاح.');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`تعذر تأكيد المسار الحالي: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenInExplorer = async () => {
    if (!window.electronAPI || busy) return;
    try {
      await window.electronAPI.openDataDirectory();
    } catch {
      // Ignore shell open error
    }
  };

  return (
    <div
      data-modal-open="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                مكان حفظ قاعدة بيانات الصيدلية والنسخ الاحتياطية
              </h3>
              <p className="text-xs text-slate-500">
                تحكم كامل في مجلد حفظ الفواتير والمخزون والحسابات المالية
              </p>
            </div>
          </div>
          {!isFirstRunSetup && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50"
              title="إغلاق (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {isFirstRunSetup && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">مرحباً بك في التشغيل الأول على هذا الجهاز!</p>
                <p>
                  اختر المكان المفضل لحفظ بيانات الصيدلية على هذا الجهاز (يُنصح باختيار بارتيشن مثل{' '}
                  <span className="font-mono font-bold" dir="ltr">D:\</span> لحمايتها في حال تغيير الويندوز مستقبلاً).
                </p>
              </div>
            </div>
          )}

          {/* Active Database Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <HardDrive className="w-4 h-4 text-emerald-600" />
                <span>ملف قاعدة البيانات النشط حالياً:</span>
              </div>
              {storageInfo && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono font-semibold text-[11px]" dir="ltr">
                  {storageInfo.dbSizeMB.toFixed(2)} MB
                </span>
              )}
            </div>

            <div
              className="px-3 py-2.5 rounded-lg bg-white border border-slate-200 font-mono text-xs text-slate-800 break-all select-text"
              dir="ltr"
            >
              {storageInfo?.activeDbPath || '...'}
            </div>

            <div className="pt-1">
              <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                مجلد النسخ الاحتياطية التلقائية (Backups):
              </span>
              <div
                className="px-3 py-2 rounded-lg bg-white border border-slate-200 font-mono text-[11px] text-slate-600 break-all select-text"
                dir="ltr"
              >
                {storageInfo?.backupsDir || '...'}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleChooseDirectory}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
            >
              {busy ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FolderOpen className="w-4 h-4" />
              )}
              <span>{busy ? 'جاري نقل واعتماد قاعدة البيانات...' : 'اختيار / تغيير مجلد حفظ الداتا...'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenInExplorer}
              disabled={busy || !storageInfo}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>فتح المجلد في الويندوز</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            يتم نقل البيانات بأمان تام دون إغلاق الفواتير المفتوحة
          </span>
          <button
            type="button"
            onClick={handleConfirmCurrent}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isFirstRunSetup ? 'اعتماد المسار الحالي وتأكيده' : 'اعتماد المسار الحالي'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
