import React, { useState, useEffect } from 'react';
import { Receipt, Eye, X } from 'lucide-react';
import { SalesInvoice, SalesInvoiceItem } from '../../../shared/types';

export const RecentInvoices: React.FC = () => {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<SalesInvoiceItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getRecentSalesInvoices(10);
        setInvoices(data);
      }
    } catch (err) {
      console.error('Failed to load recent invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewInvoice = async (invoice: SalesInvoice) => {
    setSelectedInvoice(invoice);
    setLoadingItems(true);
    try {
      if (window.electronAPI) {
        const items = await window.electronAPI.getSalesInvoiceItems(invoice.invoice_number);
        setInvoiceItems(items);
      }
    } catch (err) {
      console.error('Failed to load invoice items:', err);
      setInvoiceItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 select-none font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          <Receipt className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold text-slate-800">
            سجل آخر 10 فواتير مبيعات مسجلة
          </span>
          <span className="text-xs font-mono text-slate-400">
            (Last 10 Invoices from #864)
          </span>
        </div>

        <button
          onClick={loadInvoices}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
        >
          تحديث السجل
        </button>
      </div>

      {/* Invoices Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-600 font-sans uppercase bg-slate-50/80">
              <th className="py-2.5 px-3">رقم الفاتورة</th>
              <th className="py-2.5 px-3">التاريخ والوقت</th>
              <th className="py-2.5 px-3 text-center">عدد الأصناف</th>
              <th className="py-2.5 px-3 text-left">إجمالي الفاتورة</th>
              <th className="py-2.5 px-3 text-left">صافي الربح</th>
              <th className="py-2.5 px-3 text-center font-sans">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="py-2.5 px-3">
                    <div className="h-6 bg-slate-100 rounded" />
                  </td>
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 text-xs font-sans">
                  لا توجد فواتير مسجلة
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr 
                  key={inv.invoice_number}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="py-2.5 px-3 font-bold text-slate-800">
                    #{inv.invoice_number}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 text-xs">
                    {inv.invoice_date} <span className="text-slate-300">|</span> {inv.invoice_time}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs border border-slate-200 font-sans font-medium">
                      {inv.item_count} أصناف
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-left font-bold text-emerald-700 text-sm" data-tabular>
                    {inv.total_selling_price.toFixed(2)} ج.م
                  </td>
                  <td className="py-2.5 px-3 text-left text-slate-700" data-tabular>
                    {inv.profit.toFixed(2)} ج.م
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => handleViewInvoice(inv)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs inline-flex items-center gap-1.5 transition-colors cursor-pointer font-sans"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                      <span>عرض الأصناف</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invoice Items Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans">
            {/* Modal Header */}
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-bold text-slate-800 font-mono">
                  Invoice #{selectedInvoice.invoice_number}
                </span>
                <span className="text-xs text-slate-500 font-mono mr-2">
                  ({selectedInvoice.invoice_date} - {selectedInvoice.invoice_time})
                </span>
              </div>

              <button
                onClick={() => setSelectedInvoice(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3.5 overflow-y-auto flex-1 text-xs">
              {loadingItems ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  جاري جلب تفاصيل البنود...
                </div>
              ) : invoiceItems.length === 0 ? (
                <div className="py-6 text-center text-slate-500">
                  لا توجد بنود مسجلة
                </div>
              ) : (
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-600 bg-slate-50">
                      <th className="py-2 px-2.5 font-mono">#</th>
                      <th className="py-2 px-2.5">اسم الصنف (Trade Name)</th>
                      <th className="py-2 px-2.5 text-center font-mono">الكمية</th>
                      <th className="py-2 px-2.5 text-left font-mono">السعر</th>
                      <th className="py-2 px-2.5 text-left font-mono">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoiceItems.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50/70">
                        <td className="py-2 px-2.5 text-slate-400 font-mono text-xs">{item.line_number || idx + 1}</td>
                        <td className="py-2 px-2.5 font-bold text-slate-800" dir="ltr">
                          {item.item_name}
                        </td>
                        <td className="py-2 px-2.5 text-center text-blue-700 font-mono font-bold text-xs">
                          {item.quantity}
                        </td>
                        <td className="py-2 px-2.5 text-left text-slate-700 font-mono text-xs" data-tabular>
                          {item.unit_price.toFixed(2)}
                        </td>
                        <td className="py-2 px-2.5 text-left font-bold text-emerald-700 font-mono text-xs" data-tabular>
                          {item.line_total.toFixed(2)} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-xs text-slate-600">
                الربح المحقق: <span className="text-emerald-700 font-mono font-bold">{selectedInvoice.profit.toFixed(2)} ج.م</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-xs">إجمالي الفاتورة:</span>
                <span className="text-base font-mono font-bold text-emerald-700" data-tabular>
                  {selectedInvoice.total_selling_price.toFixed(2)} ج.م
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
