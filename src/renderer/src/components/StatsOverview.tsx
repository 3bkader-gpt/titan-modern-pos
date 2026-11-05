import React from 'react';
import { 
  CheckCircle2, 
  Wallet, 
  AlertCircle, 
  ShoppingCart
} from 'lucide-react';
import { DashboardStats } from '../../../shared/types';

interface StatsOverviewProps {
  stats: DashboardStats | null;
  loading: boolean;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  const todaySales = stats.cashBalance > 0 ? stats.cashBalance : 0;

  const cards = [
    {
      label: 'الأصناف المتوفرة على الرف',
      value: stats.inStockItems.toLocaleString('en-US'),
      detail: `من ${stats.totalCatalogItems.toLocaleString('en-US')} صنف في الكتالوج`,
      icon: CheckCircle2,
      topBorder: '#10b981',
      iconBg: 'rgba(16,185,129,0.1)',
      iconColor: '#10b981',
      valueColor: '#10b981',
    },
    {
      label: 'كشكول النواقص',
      value: stats.shortagesDraftsCount.toLocaleString('en-US'),
      detail: 'صنف مطلوب من الموردين',
      icon: AlertCircle,
      topBorder: '#f59e0b',
      iconBg: 'rgba(245,158,11,0.1)',
      iconColor: '#f59e0b',
      valueColor: '#d97706',
    },
    {
      label: 'فواتير المبيعات',
      value: stats.totalSalesInvoices.toLocaleString('en-US'),
      detail: `آخر فاتورة رقم #${stats.lastInvoiceNumber}`,
      icon: ShoppingCart,
      topBorder: '#6366f1',
      iconBg: 'rgba(99,102,241,0.1)',
      iconColor: '#6366f1',
      valueColor: '#4f46e5',
    },
    {
      label: 'رصيد الدرج (الخزينة)',
      value: stats.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }),
      detail: 'جنيه مصري • نقداً',
      icon: Wallet,
      topBorder: '#0ea5e9',
      iconBg: 'rgba(14,165,233,0.1)',
      iconColor: '#0ea5e9',
      valueColor: '#0284c7',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 select-none font-sans">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="bg-white rounded-2xl shadow-sm transition-all hover:shadow-md"
            style={{
              border: '1px solid #e2e8f0',
              borderTop: `4px solid ${card.topBorder}`,
            }}
          >
            <div className="p-4">
              {/* Icon + Label row */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-semibold text-slate-600 leading-tight">
                  {card.label}
                </span>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: card.iconBg }}
                >
                  <Icon className="w-4 h-4" style={{ color: card.iconColor }} />
                </div>
              </div>

              {/* Value */}
              <div
                className="text-[26px] font-bold font-mono leading-none mb-1"
                style={{ color: card.valueColor }}
                data-tabular
                dir="ltr"
              >
                {card.value}
              </div>

              {/* Detail */}
              <div className="text-[11px] text-slate-400 font-medium mt-1.5">
                {card.detail}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
