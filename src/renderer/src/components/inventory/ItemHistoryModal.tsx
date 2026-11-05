import React, { useState, useEffect } from 'react';
import { ItemFullHistory } from '../../../shared/types';
import { History, X, ShoppingCart, Truck, TrendingUp, Calendar, Clock, DollarSign } from 'lucide-react';

interface ItemHistoryModalProps {
  itemId: number | null;
  onClose: () => void;
}

export const ItemHistoryModal: React.FC<ItemHistoryModalProps> = ({ itemId, onClose }) => {
  const [history, setHistory] = useState<ItemFullHistory | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases' | 'prices'>('sales');

  useEffect(() => {
    if (itemId) {
      setLoading(true);
      if (window.electronAPI) {
        window.electronAPI.getItemFullHistory(itemId)
          .then(data => setHistory(data))
          .catch(err => console.error('Failed to load item history:', err))
          .finally(() => setLoading(false));
      }
    }
  }, [itemId]);

  if (!itemId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                كارت حركة الصنف الشامل (Item History Card)
              </h3>
              <p className="text-xs text-slate-500 font-sans">
                {history?.item.item_name_en} {history?.item.item_name_ar ? `(${history?.item.item_name_ar})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Item Key Summary Banner */}
        {history && (
          <div className="px-6 py-3 bg-blue-50/60 border-b border-blue-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">كود الصنف:</span>
              <span className="font-bold font-mono text-slate-900">#{history.item.item_id}</span>
            </div>
            <div>
              <span className="text-slate-500 block">سعر الجمهور الحالي:</span>
              <span className="font-bold font-mono text-slate-900">{history.item.consumer_price.toFixed(2)} ج.م</span>
            </div>
            <div>
              <span className="text-slate-500 block">الرصيد الفعلي بالمخزن:</span>
              <span className={`font-bold font-mono ${history.item.current_stock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {history.item.current_stock} {history.item.package_units > 1 ? `(${history.item.package_units} شرائط)` : 'عبوة'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">الصلاحية المسجلة:</span>
              <span className="font-semibold text-slate-800">{history.item.expiry_date || 'غير مسجلة'}</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 text-xs font-bold">
          <button
            onClick={() => setActiveTab('sales')}
            className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'sales'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>حركات المبيعات ({history?.salesHistory.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('purchases')}
            className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'purchases'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>حركات الوارد والتوريد ({history?.purchasesHistory.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('prices')}
            className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'prices'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>تاريخ تغير الأسعار ({history?.priceChangesHistory.length || 0})</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="h-44 flex items-center justify-center text-xs text-slate-400">
              جاري تحميل سجل الحركات...
            </div>
          ) : (
            <>
              {/* 1. Sales History */}
              {activeTab === 'sales' && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  {history?.salesHistory.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      لا توجد حركات بيع مسجلة لهذا الصنف حتى الآن
                    </div>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <tr>
                          <th className="py-2.5 px-3">رقم الفاتورة</th>
                          <th className="py-2.5 px-3">التاريخ والوقت</th>
                          <th className="py-2.5 px-3 text-center">نوع الوحدة</th>
                          <th className="py-2.5 px-3 text-center">الكمية</th>
                          <th className="py-2.5 px-3 text-left">سعر البيع</th>
                          <th className="py-2.5 px-3 text-left">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {history?.salesHistory.map((s, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-bold text-blue-700">#{s.invoice_number}</td>
                            <td className="py-2.5 px-3 text-slate-600 font-sans">{s.invoice_date}</td>
                            <td className="py-2.5 px-3 text-center font-sans text-slate-600">{s.unit_type || 'عبوة'}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-900">{s.quantity}</td>
                            <td className="py-2.5 px-3 text-left text-slate-700">{s.unit_price.toFixed(2)} ج.م</td>
                            <td className="py-2.5 px-3 text-left font-bold text-slate-900">{s.line_total.toFixed(2)} ج.م</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 2. Purchases History */}
              {activeTab === 'purchases' && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  {history?.purchasesHistory.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      لا توجد فواتير توريد مسجلة لهذا الصنف
                    </div>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <tr>
                          <th className="py-2.5 px-3">فاتورة توريد</th>
                          <th className="py-2.5 px-3">المورد / الشركة</th>
                          <th className="py-2.5 px-3">التاريخ</th>
                          <th className="py-2.5 px-3 text-center">الكمية + بونص</th>
                          <th className="py-2.5 px-3 text-left">سعر التكلفة</th>
                          <th className="py-2.5 px-3 text-left">سعر الجمهور</th>
                          <th className="py-2.5 px-3 text-left">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {history?.purchasesHistory.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-bold text-blue-700">#{p.purchase_invoice_id}</td>
                            <td className="py-2.5 px-3 text-slate-900 font-sans font-semibold">{p.supplier_name}</td>
                            <td className="py-2.5 px-3 text-slate-600 font-sans">{p.invoice_date}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                              {p.quantity} {p.bonus_quantity ? `(+${p.bonus_quantity})` : ''}
                            </td>
                            <td className="py-2.5 px-3 text-left text-slate-700">{p.buy_price.toFixed(2)} ج.م</td>
                            <td className="py-2.5 px-3 text-left text-slate-700">{p.consumer_price.toFixed(2)} ج.م</td>
                            <td className="py-2.5 px-3 text-left font-bold text-slate-900">{p.line_total.toFixed(2)} ج.م</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 3. Price Changes History */}
              {activeTab === 'prices' && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  {history?.priceChangesHistory.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      لم يتم تسجيل أي تعديلات سابقة في سعر هذا الصنف
                    </div>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <tr>
                          <th className="py-2.5 px-4">#</th>
                          <th className="py-2.5 px-4">تاريخ ووقت التعديل</th>
                          <th className="py-2.5 px-4 text-left">السعر القديم</th>
                          <th className="py-2.5 px-4 text-left">السعر الجديد المعتمد</th>
                          <th className="py-2.5 px-4 text-left">فرق الزيادة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {history?.priceChangesHistory.map((ph, idx) => {
                          const oldP = ph.old_price || 0;
                          const diff = ph.new_price - oldP;
                          return (
                            <tr key={idx} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-4 text-slate-400">{idx + 1}</td>
                              <td className="py-2.5 px-4 font-sans text-slate-700">{ph.change_timestamp}</td>
                              <td className="py-2.5 px-4 text-left text-slate-500">
                                {oldP > 0 ? `${oldP.toFixed(2)} ج.م` : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-left font-bold text-slate-900">
                                {ph.new_price.toFixed(2)} ج.م
                              </td>
                              <td className="py-2.5 px-4 text-left font-bold text-emerald-600">
                                {oldP > 0 && diff > 0 ? `+${diff.toFixed(2)} ج.م` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            إغلاق (Esc)
          </button>
        </div>

      </div>
    </div>
  );
};
