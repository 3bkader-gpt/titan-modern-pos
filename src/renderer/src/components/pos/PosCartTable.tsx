import React from 'react';
import { CreateSaleItemPayload, Item } from '../../../shared/types';
import { Trash2, Sparkles, Plus, Minus, AlertTriangle, ShieldAlert, Baby } from 'lucide-react';

interface CartItem extends CreateSaleItemPayload {
  current_stock: number;
  base_consumer_price: number;
  base_buy_price: number;
  has_pregnancy_warning?: boolean;
}

interface PosCartTableProps {
  items: CartItem[];
  onUpdateQuantity: (index: number, newQty: number) => void;
  onToggleUnit: (index: number) => void;
  onUpdateDiscount: (index: number, newPct: number) => void;
  onRemoveItem: (index: number) => void;
  onOpenDrugEye: (item: CartItem) => void;
}

export const PosCartTable: React.FC<PosCartTableProps> = ({
  items,
  onUpdateQuantity,
  onToggleUnit,
  onUpdateDiscount,
  onRemoveItem,
  onOpenDrugEye
}) => {
  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-3">
          <Sparkles className="w-8 h-8 text-blue-500" />
        </div>
        <h3 className="text-base font-bold text-slate-800">
          فاتورة المبيعات فارغة
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          قم بمسح الباركود باستخدام القارئ أو كتابة اسم الدواء في حقل البحث أعلاه لإضافته مباشرة للفاتورة.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] text-slate-400">اختصارات لوحة المفاتيح:</span>
          <kbd className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 border border-slate-300 text-slate-700">F2 بحث</kbd>
          <kbd className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 border border-slate-300 text-slate-700">F8 فاتورة جديدة</kbd>
          <kbd className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 border border-slate-300 text-slate-700">F9 حفظ</kbd>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden font-sans">
      {/* Table Header */}
      <div className="grid grid-cols-12 px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 select-none">
        <div className="col-span-1 text-center font-mono">#</div>
        <div className="col-span-4 text-right">الصنف والتحذيرات الطبية</div>
        <div className="col-span-2 text-center">نوع الوحدة</div>
        <div className="col-span-2 text-center">الكمية المطلوبة</div>
        <div className="col-span-1 text-left font-mono">السعر</div>
        <div className="col-span-1 text-left font-mono">خصم %</div>
        <div className="col-span-1 text-left font-mono">الإجمالي</div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {items.map((item, index) => {
          // Check stock limit (convert strips to equivalent packs if unit_type is unit)
          const packEquiv = (item.unit_type === 'unit' && item.package_units > 1)
            ? item.quantity / item.package_units
            : item.quantity;
          const isOverStock = packEquiv > item.current_stock;
          const isSchedule = item.tax_schedule_category === 1 || item.tax_schedule_category === 2;
          const hasMultipleUnits = item.package_units > 1;

          return (
            <div
              key={`${item.item_id}-${index}`}
              className={`grid grid-cols-12 px-4 py-3 items-center text-xs transition-colors ${
                isOverStock ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50/80'
              }`}
            >
              {/* 1. Line Number */}
              <div className="col-span-1 text-center font-mono font-bold text-slate-400">
                {index + 1}
              </div>

              {/* 2. Drug Name & Clinical Badges */}
              <div className="col-span-4 pr-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-900 truncate text-xs" title={item.item_name}>
                    {item.item_name}
                  </span>

                  {/* Warning badges */}
                  {isSchedule && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-0.5">
                      <ShieldAlert className="w-2.5 h-2.5" />
                      <span>جدول {item.tax_schedule_category === 1 ? 'أول' : 'ثانٍ'}</span>
                    </span>
                  )}

                  {item.has_pregnancy_warning && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-0.5">
                      <Baby className="w-2.5 h-2.5" />
                      <span>تحذير حمل</span>
                    </span>
                  )}

                  {isOverStock && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                      <span>أكبر من الرصيد ({item.current_stock})</span>
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 truncate flex items-center gap-2 mt-0.5">
                  <span>{item.item_name_ar || '—'}</span>
                  {item.generic_name && (
                    <>
                      <span>•</span>
                      <span className="font-mono text-slate-400">{item.generic_name}</span>
                    </>
                  )}
                </div>
              </div>

              {/* 3. Unit Toggle (Pack / Strip) */}
              <div className="col-span-2 flex justify-center">
                {hasMultipleUnits ? (
                  <button
                    type="button"
                    onClick={() => onToggleUnit(index)}
                    className="flex items-center p-0.5 rounded-lg border border-slate-300 bg-slate-100 text-[11px] font-bold transition-all shadow-2xs hover:border-blue-400"
                    title={`التبديل بين عبوة كاملة أو شريط (${item.package_units} شريط بالعلبة)`}
                  >
                    <span
                      className={`px-2 py-0.5 rounded-md transition-colors ${
                        item.unit_type === 'pack'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      عبوة
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md transition-colors ${
                        item.unit_type === 'unit'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      شريط
                    </span>
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500 px-2 py-0.5 rounded bg-slate-100">
                    عبوة كاملة
                  </span>
                )}
              </div>

              {/* 4. Quantity Stepper */}
              <div className="col-span-2 flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                  className="w-7 h-7 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={item.quantity}
                  onChange={e => onUpdateQuantity(index, parseFloat(e.target.value) || 1)}
                  className="w-14 px-1 py-1 text-center font-mono font-bold text-xs rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none"
                />

                <button
                  type="button"
                  onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                  className="w-7 h-7 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 5. Unit Price */}
              <div className="col-span-1 text-left font-mono font-bold text-slate-800">
                {item.unit_price.toFixed(2)}
              </div>

              {/* 6. Discount % Input */}
              <div className="col-span-1 text-left">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.discount_pct || 0}
                  onChange={e => onUpdateDiscount(index, parseFloat(e.target.value) || 0)}
                  className="w-11 px-1 py-1 text-center font-mono text-xs rounded-lg border border-slate-200 focus:border-blue-500 outline-none"
                />
              </div>

              {/* 7. Subtotal & Quick Actions */}
              <div className="col-span-1 flex items-center justify-between gap-1 text-left">
                <span className="font-mono font-bold text-slate-900">
                  {item.line_total.toFixed(2)}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenDrugEye(item)}
                    title="بدائل المادة الفعالة (Alt+A)"
                    className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    title="حذف السطر (Delete)"
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cart Table Bottom Summary Bar */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
        <div>
          عدد الأصناف: <span className="font-bold text-slate-900 font-mono">{items.length}</span>
          <span className="mx-2 text-slate-300">•</span>
          إجمالي القطع: <span className="font-bold text-slate-900 font-mono">
            {items.reduce((acc, curr) => acc + curr.quantity, 0)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span>المجموع الفرعي:</span>
          <span className="font-bold text-sm text-slate-900 font-mono">
            {items.reduce((acc, curr) => acc + curr.line_total, 0).toFixed(2)} ج.م
          </span>
        </div>
      </div>
    </div>
  );
};
