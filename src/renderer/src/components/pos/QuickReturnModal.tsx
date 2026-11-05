import React, { useState, useEffect } from 'react';
import { SalesInvoice, SalesInvoiceItem, ReturnItemPayload, ReturnSaleInvoiceResult } from '../../../shared/types';
import { RotateCcw, Search, X, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { playBeepSuccess, playCheckoutChime, playWarningTone } from './soundEffects';

interface QuickReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ReturnSaleInvoiceResult) => void;
}

interface ReturnItemState {
  item: SalesInvoiceItem;
  selected: boolean;
  returnQty: number;
}

export const QuickReturnModal: React.FC<QuickReturnModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [invoiceQuery, setInvoiceQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setInvoiceQuery('');
      setInvoice(null);
      setReturnItems([]);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNum = invoiceQuery.replace(/[^0-9]/g, '');
    if (!cleanNum) {
      setError('يرجى إدخال رقم فاتورة صحيح');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (window.electronAPI) {
        const invNum = parseInt(cleanNum, 10);
        const data = await window.electronAPI.getInvoiceForReturn(invNum);
        if (!data || !data.invoice) {
          setError(`الفاتورة رقم #${invNum} غير موجودة في قاعدة البيانات.`);
          setInvoice(null);
          setReturnItems([]);
          playWarningTone();
        } else {
          setInvoice(data.invoice);
          setReturnItems(
            data.items.map(item => {
              const remaining = item.remaining_quantity !== undefined ? item.remaining_quantity : item.quantity;
              return {
                item,
                selected: remaining > 0,
                returnQty: remaining
              };
            })
          );
          if (data.is_fully_returned) {
            setError('تنبيه: تم استرجاع كافة بنود هذه الفاتورة بالكامل مسبقاً، لا توجد كميات قابلة للإرجاع.');
          }
          playBeepSuccess();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`خطأ أثناء البحث: ${msg}`);
      playWarningTone();
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    setReturnItems(prev => prev.map(i => {
      const rem = i.item.remaining_quantity !== undefined ? i.item.remaining_quantity : i.item.quantity;
      return rem > 0 ? { ...i, selected: checked } : i;
    }));
  };

  const toggleSelectItem = (index: number) => {
    setReturnItems(prev => prev.map((item, i) => {
      if (i === index) {
        const rem = item.item.remaining_quantity !== undefined ? item.item.remaining_quantity : item.item.quantity;
        return rem > 0 ? { ...item, selected: !item.selected } : item;
      }
      return item;
    }));
  };

  const updateItemQty = (index: number, qty: number) => {
    setReturnItems(prev => prev.map((item, i) => {
      if (i === index) {
        const maxQty = item.item.remaining_quantity !== undefined ? item.item.remaining_quantity : item.item.quantity;
        const validQty = Math.max(0.1, Math.min(maxQty, qty));
        return { ...item, returnQty: validQty };
      }
      return item;
    }));
  };

  const selectedItems = returnItems.filter(i => {
    const rem = i.item.remaining_quantity !== undefined ? i.item.remaining_quantity : i.item.quantity;
    return i.selected && rem > 0 && i.returnQty > 0;
  });

  const totalRefund = selectedItems.reduce((acc, curr) => {
    const price = curr.item.effective_unit_price !== undefined ? curr.item.effective_unit_price : curr.item.unit_price;
    return acc + (price * curr.returnQty);
  }, 0);

  const handleExecuteReturn = async () => {
    if (!invoice || selectedItems.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const payloadItems: ReturnItemPayload[] = selectedItems.map(si => ({
        item_id: si.item.item_id,
        item_name: si.item.item_name,
        quantity: si.returnQty,
        unit_type: (si.item.unit_type === 'شريط' ? 'unit' : 'pack') as 'pack' | 'unit',
        package_units: 1,
        unit_price: si.item.effective_unit_price !== undefined ? si.item.effective_unit_price : si.item.unit_price
      }));

      if (window.electronAPI) {
        const result = await window.electronAPI.returnSaleInvoice(invoice.invoice_number, payloadItems);
        if (result.success) {
          playCheckoutChime();
          onSuccess(result);
          onClose();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`فشل تنفيذ المرتجع: ${msg}`);
      playWarningTone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                مرتجع مبيعات سريع (Quick Sales Return - F11)
              </h3>
              <p className="text-xs text-slate-500">
                استرجاع صنف أو فاتورة كاملة وإعادة الرصيد للمخزن ورد المبلغ للخزينة
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

        {/* Search Bar */}
        <div className="p-6 border-b border-slate-200 bg-white">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={invoiceQuery}
                onChange={e => setInvoiceQuery(e.target.value)}
                placeholder="أدخل رقم الفاتورة (مثال: 864 أو 865) ثم اضغط Enter..."
                className="w-full pl-4 pr-10 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-slate-800"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'جاري البحث...' : 'بحث الفاتورة'}
            </button>
          </form>

          {error && (
            <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Invoice Items Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/60">
          {invoice ? (
            <div className="space-y-4">
              {/* Invoice Summary Banner */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">رقم الفاتورة:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">#{invoice.invoice_number}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">التاريخ والوقت:</span>
                  <span className="font-semibold text-slate-800">{invoice.invoice_date}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">طريقة الدفع:</span>
                  <span className="font-semibold text-slate-800">
                    {invoice.payment_method || 'نقدي'}
                    {invoice.payment_method === 'آجل' && invoice.client_name ? ` (${invoice.client_name})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">إجمالي البيع الأصلي:</span>
                  <span className="font-bold text-blue-700 font-mono text-sm">
                    {invoice.total_selling_price.toFixed(2)} ج.م
                    {Boolean(invoice.discount && invoice.discount > 0) && (
                      <span className="text-xs text-rose-600 font-normal block">
                        (خصم: {invoice.discount} ج.م)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Items Select List */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={returnItems.length > 0 && returnItems.filter(i => (i.item.remaining_quantity ?? i.item.quantity) > 0).every(i => i.selected)}
                      onChange={e => toggleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>تحديد البنود القابلة للإرجاع</span>
                  </label>
                  <span className="text-slate-500 font-mono">
                    {selectedItems.length} من {returnItems.filter(i => (i.item.remaining_quantity ?? i.item.quantity) > 0).length} محددة
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {returnItems.map((entry, idx) => {
                    const remaining = entry.item.remaining_quantity !== undefined ? entry.item.remaining_quantity : entry.item.quantity;
                    const isFullyReturned = remaining <= 0;
                    const effPrice = entry.item.effective_unit_price !== undefined ? entry.item.effective_unit_price : entry.item.unit_price;
                    const hasDiscount = Math.abs(effPrice - entry.item.unit_price) > 0.01;

                    return (
                      <div
                        key={idx}
                        className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                          isFullyReturned
                            ? 'bg-slate-100/70 opacity-50'
                            : entry.selected ? 'bg-blue-50/30' : 'opacity-60 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={entry.selected && !isFullyReturned}
                            disabled={isFullyReturned}
                            onChange={() => toggleSelectItem(idx)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-900 truncate">
                                {entry.item.item_name}
                              </h4>
                              {isFullyReturned && (
                                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-semibold">
                                  تم إرجاعه بالكامل
                                </span>
                              )}
                              {Boolean(entry.item.returned_quantity && entry.item.returned_quantity > 0 && !isFullyReturned) && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                  مسترجع مسبقاً: {entry.item.returned_quantity}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>الوحدة: {entry.item.unit_type || 'عبوة'}</span>
                              <span>•</span>
                              <span className="font-mono text-slate-700">
                                سعر الاسترداد: {effPrice.toFixed(2)} ج.م {hasDiscount ? '(بعد الخصم)' : ''}
                              </span>
                              {hasDiscount && (
                                <span className="line-through text-slate-400 font-mono text-[10px]">
                                  {entry.item.unit_price.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quantity Input */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-500">الكمية المرتجعة:</span>
                          <input
                            type="number"
                            step="any"
                            min="0.1"
                            max={remaining}
                            value={entry.returnQty}
                            disabled={!entry.selected || isFullyReturned}
                            onChange={e => updateItemQty(idx, parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-xs text-center font-mono font-bold rounded-lg border border-slate-300 focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                          />
                          <span className="text-xs text-slate-400 font-mono">/ {remaining}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Refund Summary */}
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-rose-800 font-semibold block">
                    إجمالي المبلغ المسترد:
                  </span>
                  <span className="text-[11px] text-rose-600">
                    {invoice.payment_method === 'آجل'
                      ? `سيتم خصم هذا المبلغ (${totalRefund.toFixed(2)} ج.م) من رصيد حساب العميل فوراً دون لمس درج النقدية.`
                      : invoice.payment_method === 'فيزا' || invoice.payment_method === 'محفظة / إنستاباي'
                      ? `مرتجع إلكتروني/بنكي - لن يتم سحب نقدية من درج الخزينة.`
                      : `سيتم رد هذا المبلغ (${totalRefund.toFixed(2)} ج.م) نقداً للعميل وخصمه من الخزينة فوراً.`}
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-rose-700">
                  {totalRefund.toFixed(2)} ج.م
                </div>
              </div>
            </div>
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-center text-slate-400">
              <Search className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-xs">أدخل رقم الفاتورة في الحقل أعلاه واضغط بحث لعرض بنودها</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            إلغاء (Esc)
          </button>

          <button
            onClick={handleExecuteReturn}
            disabled={!invoice || selectedItems.length === 0 || submitting}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow transition-all disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{submitting ? 'جاري التنفيذ...' : `تأكيد مرتجع الأصناف (${totalRefund.toFixed(2)} ج.م)`}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
