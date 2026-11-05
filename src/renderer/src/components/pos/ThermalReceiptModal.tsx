import React, { useRef, useState, useEffect } from 'react';
import { CreateSaleInvoiceResult } from '../../../shared/types';
import { Printer, X, Building2 } from 'lucide-react';

interface ThermalReceiptModalProps {
  invoice: CreateSaleInvoiceResult;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({ invoice, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const is80mm = paperWidth === '80mm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Action Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <h3 className="text-sm font-bold text-slate-800">
              معاينة الإيصال الحراري
            </h3>
          </div>

          {/* Paper Size Selector */}
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPaperWidth('80mm')}
              className={`px-3 py-1 rounded-md transition-all ${
                is80mm
                  ? 'bg-white text-emerald-800 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              80 مم (قياسي)
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth('58mm')}
              className={`px-3 py-1 rounded-md transition-all ${
                !is80mm
                  ? 'bg-white text-emerald-800 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              58 مم (صغير)
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-colors"
            title="إغلاق (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Paper Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center">
          <div 
            ref={receiptRef}
            id="thermal-receipt"
            className={`${
              is80mm ? 'w-[76mm] max-w-[76mm] text-[11px]' : 'w-[54mm] max-w-[54mm] text-[9.5px]'
            } bg-white p-3 text-slate-900 shadow-sm border border-slate-200 font-mono leading-tight select-text transition-all print:border-none print:shadow-none print:p-1`}
            style={{ direction: 'rtl' }}
          >
            {/* Pharmacy Branding Header */}
            <div className="text-center pb-2.5 border-b border-dashed border-slate-400 print:border-black mb-2.5 space-y-1">
              <div className="flex items-center justify-center gap-1 font-bold text-slate-900">
                <Building2 className="w-3.5 h-3.5 text-emerald-600 print:hidden" />
                <span className="font-sans font-bold tracking-tight text-[12px]" dir="ltr">Mariam Elhomeily Pharmacy</span>
              </div>
              <p className="text-[11px] font-bold text-slate-900">صيدلية د. مريم الحميلي</p>
              <p className="text-[9px] text-slate-600 print:text-black">خدمة ورعاية صيدلانية متكاملة</p>
              <div className="text-[9px] text-slate-500 print:text-black flex items-center justify-center gap-2">
                <span>ت: 01000000000</span>
                <span>•</span>
                <span>س.ت: 45892</span>
              </div>
            </div>

            {/* Invoice Meta */}
            <div className="space-y-1 pb-2 border-b border-dashed border-slate-400 print:border-black mb-2 text-[10px]">
              <div className="flex justify-between font-bold text-slate-900">
                <span>فاتورة مبيعات:</span>
                <span className="font-mono text-xs">#{invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between text-slate-700 print:text-black">
                <span>التاريخ:</span>
                <span>{invoice.invoice_date} {invoice.invoice_time}</span>
              </div>
              <div className="flex justify-between text-slate-700 print:text-black">
                <span>طريقة الدفع:</span>
                <span className="font-semibold text-slate-900">{invoice.payment_method}</span>
              </div>
              {invoice.client_name && (
                <div className="flex justify-between text-slate-700 print:text-black">
                  <span>العميل:</span>
                  <span className="font-semibold text-slate-900">{invoice.client_name}</span>
                </div>
              )}
              {invoice.client_address && (
                <div className="text-[9px] text-slate-600 print:text-black pt-0.5">
                  <span>العنوان: </span>
                  <span>{invoice.client_address}</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="pb-2 border-b border-dashed border-slate-400 print:border-black mb-2">
              <div className="grid grid-cols-12 text-[10px] font-bold pb-1 text-slate-800 print:text-black border-b border-slate-200 print:border-black mb-1">
                <span className="col-span-6 text-right">الصنف</span>
                <span className="col-span-2 text-center">الكمية</span>
                <span className="col-span-2 text-left">السعر</span>
                <span className="col-span-2 text-left">الإجمالي</span>
              </div>

              <div className="space-y-1.5">
                {invoice.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 text-[10px] leading-tight">
                    <div className="col-span-6 text-right font-sans">
                      <div className="font-bold text-slate-900 truncate" title={item.item_name}>
                        {item.item_name}
                      </div>
                      <div className="text-[8.5px] text-slate-500 print:text-black">
                        {item.unit_type === 'unit' ? 'شريط / وحدة' : 'عبوة'}
                      </div>
                    </div>
                    <span className="col-span-2 text-center font-mono font-medium">
                      {item.quantity}
                    </span>
                    <span className="col-span-2 text-left font-mono">
                      {item.unit_price.toFixed(2)}
                    </span>
                    <span className="col-span-2 text-left font-mono font-bold">
                      {item.line_total.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="space-y-1 text-[11px] pb-2.5 border-b border-dashed border-slate-400 print:border-black mb-2.5">
              <div className="flex justify-between text-slate-700 print:text-black">
                <span>إجمالي الأصناف:</span>
                <span className="font-mono">{invoice.total_selling_price.toFixed(2)} ج.م</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-rose-600 print:text-black font-semibold">
                  <span>الخصم:</span>
                  <span className="font-mono">-{invoice.discount.toFixed(2)} ج.م</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200 print:border-black">
                <span>الصافي المطلوب:</span>
                <span className="font-mono text-base font-extrabold">
                  {(invoice.total_selling_price - invoice.discount).toFixed(2)} ج.م
                </span>
              </div>
              {invoice.change > 0 && (
                <div className="flex justify-between text-[10px] text-emerald-800 print:text-black font-semibold pt-0.5">
                  <span>الباقي للعميل:</span>
                  <span className="font-mono">{invoice.change.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>

            {/* Simulated Barcode */}
            <div className="text-center space-y-1 pb-1">
              <div className="flex items-center justify-center gap-[2px] h-8 px-2 overflow-hidden">
                {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3, 1, 4, 2, 3, 1, 2, 4, 1, 3].map((w, i) => (
                  <span 
                    key={i} 
                    className="h-full bg-slate-900 print:bg-black inline-block" 
                    style={{ width: `${w * (is80mm ? 1.2 : 0.9)}px` }} 
                  />
                ))}
              </div>
              <p className="text-[9px] font-mono text-slate-600 print:text-black tracking-widest font-bold">
                *INV-{invoice.invoice_number}*
              </p>
            </div>

            {/* Footer Notes */}
            <div className="text-center text-[8.5px] text-slate-600 print:text-black space-y-0.5 pt-1">
              <p className="font-semibold text-slate-800 print:text-black">مع تمنياتنا لكم بتمام الصحة والعافية</p>
              <p>الاستبدال والاسترجاع خلال 14 يوماً مع الفاتورة</p>
              <p className="text-[8px] text-slate-400 print:text-black">Mariam Elhomeily Pharmacy POS</p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Buttons */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            إغلاق (Esc)
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الإيصال (Enter)</span>
          </button>
        </div>

      </div>
    </div>
  );
};

