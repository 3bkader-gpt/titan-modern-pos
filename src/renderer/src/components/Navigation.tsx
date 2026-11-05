import React from 'react';
import { 
  ShoppingCart, 
  Pill, 
  Truck, 
  ClipboardList, 
  Landmark, 
  BarChart3, 
  LayoutDashboard
} from 'lucide-react';

export type NavTab = 'dashboard' | 'pos' | 'catalog' | 'purchases' | 'shortages' | 'treasury' | 'reports';

interface NavigationProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ElementType;
  shortcut: string;
  badge?: string;
}

export const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'لوحة القيادة',
    icon: LayoutDashboard,
    shortcut: 'Esc'
  },
  {
    id: 'pos',
    label: 'نقطة البيع (الكاشير)',
    icon: ShoppingCart,
    shortcut: 'F1'
  },
  {
    id: 'catalog',
    label: 'كتالوج الأدوية',
    icon: Pill,
    shortcut: 'F7',
  },
  {
    id: 'purchases',
    label: 'فواتير الوارد',
    icon: Truck,
    shortcut: 'F3'
  },
  {
    id: 'shortages',
    label: 'كشكول النواقص',
    icon: ClipboardList,
    shortcut: 'F4',
  },
  {
    id: 'treasury',
    label: 'الخزينة والورديات',
    icon: Landmark,
    shortcut: 'F5'
  },
  {
    id: 'reports',
    label: 'التقارير والتحليلات',
    icon: BarChart3,
    shortcut: 'F6'
  }
];

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav className="w-56 flex flex-col shrink-0 select-none font-sans"
      style={{ background: '#0f172a' }}>
      
      {/* Logo / Brand mark */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: '#10b981' }}>
            <Pill className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[13px] font-bold text-white leading-tight">صيدلية د. مريم</span>
        </div>
      </div>

      {/* Nav Items */}
      <div className="flex-1 p-2.5 space-y-0.5">
        <div className="px-2 py-1.5 text-[10px] font-bold tracking-widest uppercase mb-1"
          style={{ color: '#475569' }}>
          القوائم الرئيسية
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-right transition-all cursor-pointer group"
              style={{
                background: isActive ? '#10b981' : 'transparent',
                color: isActive ? '#ffffff' : '#94a3b8',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                  (e.currentTarget as HTMLElement).style.color = '#e2e8f0';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                }
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0" style={{ opacity: isActive ? 1 : 0.7 }} />
                <span className="text-[13px] truncate font-medium">{item.label}</span>
              </div>

              <kbd
                className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono font-bold rounded"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)',
                  color: isActive ? '#fff' : '#64748b',
                  border: '1px solid',
                  borderColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                }}
              >
                {item.shortcut}
              </kbd>
            </button>
          );
        })}
      </div>

      {/* Bottom status — minimal */}
      <div className="p-3 border-t border-slate-700/60">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-medium" style={{ color: '#64748b' }}>
            قاعدة البيانات متصلة
          </span>
        </div>
      </div>
    </nav>
  );
};
