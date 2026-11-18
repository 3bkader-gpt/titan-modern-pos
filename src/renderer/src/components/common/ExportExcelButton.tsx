import React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { serializeToUtf8BomCsv } from '../../../../shared/csv';

interface ExportExcelButtonProps {
  fileNamePrefix: string;
  headers: string[];
  getRows: () => ReadonlyArray<ReadonlyArray<unknown>>;
  label?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function downloadUtf8BomCsv(
  fileNamePrefix: string,
  headers: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): void {
  const csvContent = serializeToUtf8BomCsv(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const datePart = new Date().toISOString().split('T')[0];
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileNamePrefix}_${datePart}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export const ExportExcelButton: React.FC<ExportExcelButtonProps> = ({
  fileNamePrefix,
  headers,
  getRows,
  label = 'تصدير Excel',
  disabled = false,
  title = 'تصدير الجدول بصيغة CSV المتوافقة مع Arabic Excel (UTF-8 BOM)',
  className
}) => {
  const handleExport = () => {
    if (disabled) return;
    const rows = getRows();
    if (!rows || rows.length === 0) return;
    downloadUtf8BomCsv(fileNamePrefix, headers, rows);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled}
      title={title}
      className={
        className ||
        'px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors'
      }
    >
      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
      <span>{label}</span>
    </button>
  );
};
