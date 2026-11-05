import React from 'react';
import { Landmark, BarChart3 } from 'lucide-react';

interface PlaceholderViewProps {
  title: string;
  shortcut: string;
  description: string;
  icon: React.ElementType;
  phaseInfo?: string;
}

const PlaceholderCard: React.FC<PlaceholderViewProps> = ({
  title,
  shortcut,
  description,
  icon: Icon,
  phaseInfo = 'مجدول للإطلاق في المرحلة القادمة'
}) => (
  <div className="h-[75vh] flex flex-col items-center justify-center text-center p-8 bg-white rounded-xl border border-slate-200/90 shadow-2xs font-sans select-none">
    <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-3.5 text-blue-600">
      <Icon className="w-7 h-7" />
    </div>

    <div className="flex items-center gap-2.5 mb-2">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      <kbd className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-slate-100 border border-slate-300 text-slate-700">
        {shortcut}
      </kbd>
    </div>

    <p className="text-sm text-slate-500 max-w-md mb-4 leading-relaxed">
      {description}
    </p>

    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600">
      <span className="w-2 h-2 rounded-full bg-emerald-500" />
      <span>{phaseInfo}</span>
    </div>
  </div>
);

export const TreasuryView: React.FC = () => (
  <PlaceholderCard
    title="الخزينة والحسابات المالية"
    shortcut="F5"
    description="إدارة الخزينة (الرصيد الفعلي 119,242.50 ج.م)، إيصالات القبض والصرف، وجلسات الورديات."
    icon={Landmark}
    phaseInfo="المرحلة 5: إدارة الخزينة والمصروفات"
  />
);

export const ReportsView: React.FC = () => (
  <PlaceholderCard
    title="التقارير المالية واليوميات"
    shortcut="F6"
    description="تقارير الأرباح، جرد المخزون، حركة المبيعات اليومية، وتحليلات حركة الأصناف الأكثر مبيعاً."
    icon={BarChart3}
    phaseInfo="المرحلة 6: التحليلات والتقارير المتقدمة"
  />
);
