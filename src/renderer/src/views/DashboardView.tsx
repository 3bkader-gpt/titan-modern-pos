import React from 'react';
import { StatsOverview } from '../components/StatsOverview';
import { DrugExplorer } from '../components/DrugExplorer';
import { RecentInvoices } from '../components/RecentInvoices';
import { DashboardStats } from '../../../shared/types';

interface DashboardViewProps {
  stats: DashboardStats | null;
  loadingStats: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ stats, loadingStats }) => {
  return (
    <div className="space-y-2 pb-2">
      {/* 1. Live Clinical Statistics Overview */}
      <StatsOverview stats={stats} loading={loadingStats} />

      {/* 2. Real-Time Drug & DrugEye Alternatives Matrix */}
      <div>
        <DrugExplorer />
      </div>

      {/* 3. Last 10 Sales Invoices Ledger */}
      <div>
        <RecentInvoices />
      </div>
    </div>
  );
};
