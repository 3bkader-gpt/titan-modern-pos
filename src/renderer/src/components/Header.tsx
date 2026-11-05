import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Wallet, 
  Receipt, 
  HardDrive, 
  Usb, 
  RefreshCw,
  Pill
} from 'lucide-react';
import { DashboardStats, BackupStatus } from '../../../shared/types';

interface HeaderProps {
  stats: DashboardStats | null;
  backupStatus: BackupStatus | null;
  onTriggerBackup: () => void;
  isBackingUp: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  backupStatus,
  onTriggerBackup,
  isBackingUp
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })
      );
      const dayName = now.toLocaleDateString('ar-EG', { weekday: 'short' });
      const monthName = now.toLocaleDateString('ar-EG', { month: 'short' });
      const dayNum = now.getDate();
      const year = now.getFullYear();
      setCurrentDate(`${dayName}، ${dayNum} ${monthName} ${year}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isUsb = backupStatus?.status === 'USB_CONNECTED';

  return (
    <header
      className="h-14 px-4 flex items-center justify-between select-none z-30 shrink-0 font-sans"
      style={{ background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: '#10b981' }}
        >
          <Pill className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-white leading-tight tracking-tight" dir="ltr">
            Mariam Elhomeily Pharmacy
          </h1>
          <span className="text-[11px] font-medium" style={{ color: '#64748b' }}>
            نظام نقطة البيع v1.0
          </span>
        </div>
      </div>

      {/* Center: Live Clock & Date */}
      <div
        className="hidden lg:flex items-center gap-3 px-3.5 py-1.5 rounded-lg text-xs font-sans"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#94a3b8'
        }}
      >
        <Clock className="w-3.5 h-3.5" style={{ color: '#10b981' }} />
        <span className="font-mono font-bold text-white" dir="ltr">
          {currentTime || '--:--:--'}
        </span>
        <span style={{ color: '#334155' }}>|</span>
        <span className="font-medium">
          {currentDate}
        </span>
      </div>

      {/* Right: Cash Drawer, Invoice, USB Backup */}
      <div className="flex items-center gap-2.5">
        {/* Treasury Safe */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.25)'
          }}
        >
          <Wallet className="w-4 h-4" style={{ color: '#10b981' }} />
          <span className="text-xs font-medium text-white/70">الخزينة:</span>
          <span className="font-mono text-sm font-bold" style={{ color: '#10b981' }} data-tabular>
            {stats ? stats.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
            <span className="text-xs font-sans font-normal mr-1 text-white/60">ج.م</span>
          </span>
        </div>

        {/* Last Invoice */}
        <div
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-sans"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#94a3b8'
          }}
        >
          <Receipt className="w-3.5 h-3.5" style={{ color: '#64748b' }} />
          <span>فاتورة:</span>
          <span className="font-mono font-bold text-white">
            #{stats ? stats.lastInvoiceNumber : '—'}
          </span>
        </div>

        {/* USB & Backup Status Button */}
        <div
          className="flex items-center gap-1.5 p-1 rounded-lg"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-sans`}
            style={
              isUsb
                ? { background: 'rgba(59,130,246,0.2)', color: '#60a5fa', fontWeight: 700 }
                : { color: '#64748b' }
            }
            title={backupStatus?.message}
          >
            {isUsb
              ? <Usb className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />
              : <HardDrive className="w-3.5 h-3.5" style={{ color: '#475569' }} />}
            <span>{isUsb ? backupStatus?.usbDrive : 'محلي'}</span>
          </div>

          <button
            onClick={onTriggerBackup}
            disabled={isBackingUp}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBackingUp ? 'animate-spin' : ''}`} style={{ color: '#64748b' }} />
            <span>نسخ احتياطي</span>
          </button>
        </div>
      </div>
    </header>
  );
};
