import React, { useState, useEffect } from 'react';
import { Customer } from '../../../shared/types';
import { 
  Banknote, 
  CreditCard, 
  Smartphone, 
  UserCheck, 
  Bike, 
  Printer, 
  CheckCircle2, 
  RotateCcw, 
  AlertTriangle,
  Plus,
  Coins
} from 'lucide-react';

interface PosCheckoutPanelProps {
  subtotal: number;
  discount: number;
  onChangeDiscount: (amount: number) => void;
  netTotal: number;
  paymentMethod: 'نقدي' | 'فيزا' | 'محفظة / إنستاباي' | 'آجل' | 'دليفري';
  onChangePaymentMethod: (method: 'نقدي' | 'فيزا' | 'محفظة / إنستاباي' | 'آجل' | 'دليفري') => void;
  paidAmount: number;
  onChangePaidAmount: (amount: number) => void;
  changeAmount: number;
  clientName: string;
  onChangeClientName: (val: string) => void;
  clientPhone: string;
  onChangeClientPhone: (val: string) => void;
  clientAddress: string;
  onChangeClientAddress: (val: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onSaveAndPrint: () => void;
  onOpenQuickReturn: () => void;
  hasItems: boolean;
  maxRecommendedDiscountPct?: number; // e.g. 15% margin protection
}

export const PosCheckoutPanel: React.FC<PosCheckoutPanelProps> = ({
  subtotal,
  discount,
  onChangeDiscount,
  netTotal,
  paymentMethod,
  onChangePaymentMethod,
  paidAmount,
  onChangePaidAmount,
  changeAmount,
  clientName,
  onChangeClientName,
  clientPhone,
  onChangeClientPhone,
  clientAddress,
  onChangeClientAddress,
  isSaving,
  onSave,
  onSaveAndPrint,
  onOpenQuickReturn,
  hasItems,
  maxRecommendedDiscountPct = 15
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustAddr, setNewCustAddr] = useState<string>('');

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getCustomers('').then(data => setCustomers(data || []));
    }
  }, []);

  // Check if discount exceeds safe pharmacy margin
  const discountPct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
  const isDiscountRisky = discountPct > maxRecommendedDiscountPct;

  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    try {
      if (window.electronAPI) {
        const created = await window.electronAPI.addCustomer(newCustName, newCustPhone, newCustAddr);
        setCustomers(prev => [created, ...prev]);
        onChangeClientName(created.customer_name);
        if (newCustPhone) onChangeClientPhone(newCustPhone);
        if (newCustAddr) onChangeClientAddress(newCustAddr);
        setShowAddCustomer(false);
        setNewCustName('');
        setNewCustPhone('');
        setNewCustAddr('');
      }
    } catch (err) {
      console.error('Failed to add customer:', err);
    }
  };

  const handleQuickTender = (addValue: number) => {
    if (addValue === 0) {
      onChangePaidAmount(netTotal);
    } else {
      onChangePaidAmount(paidAmount + addValue);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-2xs p-4 font-sans select-none overflow-y-auto">
      
      {/* 1. Header & Quick Return F11 trigger */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-blue-600" />
          <span>الحساب والدفع (Checkout)</span>
        </h3>

        <button
          type="button"
          onClick={onOpenQuickReturn}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
          title="مرتجع مبيعات سريع (F11)"
        >
          <RotateCcw className="w-3 h-3" />
          <span>مرتجع F11</span>
        </button>
      </div>

      {/* 2. Financial Summary Cards */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>إجمالي الأصناف:</span>
          <span className="font-mono font-bold text-slate-900">{subtotal.toFixed(2)} ج.م</span>
        </div>

        {/* Discount Input */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600">قيمة الخصم:</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              step="any"
              value={discount || ''}
              onChange={e => onChangeDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0.00"
              className="w-20 px-2 py-1 text-left font-mono font-bold text-xs rounded-lg border border-slate-300 focus:border-blue-500 outline-none"
            />
            <span className="text-slate-500 font-mono text-[11px]">ج.م</span>
          </div>
        </div>

        {/* Margin Risk Alert */}
        {isDiscountRisky && (
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] flex items-center gap-1.5 leading-tight">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>تنبيه: الخصم ({discountPct.toFixed(1)}%) يتجاوز هامش الربح ({maxRecommendedDiscountPct}%)!</span>
          </div>
        )}

        {/* Large Net Total Hero Display */}
        <div className="p-3.5 rounded-xl bg-slate-900 text-white shadow-inner flex flex-col justify-between">
          <span className="text-[11px] text-slate-300 font-medium">الصافي المطلوب دفعه:</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black font-mono tracking-tight text-white">
              {netTotal.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-slate-300">ج.م</span>
          </div>
        </div>
      </div>

      {/* 3. Payment Method Switcher */}
      <div className="mb-3">
        <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
          طريقة التحصيل:
        </label>
        <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => onChangePaymentMethod('نقدي')}
            className={`py-2 px-1.5 rounded-lg border flex flex-col items-center gap-1 transition-all ${
              paymentMethod === 'نقدي'
                ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-500'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span className="text-[10px]">نقدي</span>
          </button>

          <button
            type="button"
            onClick={() => onChangePaymentMethod('فيزا')}
            className={`py-2 px-1.5 rounded-lg border flex flex-col items-center gap-1 transition-all ${
              paymentMethod === 'فيزا'
                ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-500'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span className="text-[10px]">فيزا</span>
          </button>

          <button
            type="button"
            onClick={() => onChangePaymentMethod('محفظة / إنستاباي')}
            className={`py-2 px-1.5 rounded-lg border flex flex-col items-center gap-1 transition-all ${
              paymentMethod === 'محفظة / إنستاباي'
                ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-500'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span className="text-[10px]">إنستاباي</span>
          </button>

          <button
            type="button"
            onClick={() => onChangePaymentMethod('آجل')}
            className={`py-2 px-1.5 rounded-lg border flex flex-col items-center gap-1 transition-all ${
              paymentMethod === 'آجل'
                ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-500'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span className="text-[10px]">آجل (عميل)</span>
          </button>

          <button
            type="button"
            onClick={() => onChangePaymentMethod('دليفري')}
            className={`col-span-2 py-2 px-1.5 rounded-lg border flex flex-col items-center gap-1 transition-all ${
              paymentMethod === 'دليفري'
                ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-500'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Bike className="w-4 h-4" />
            <span className="text-[10px]">توصيل منزلي (دليفري)</span>
          </button>
        </div>
      </div>

      {/* 4. Customer Details for Credit/Delivery */}
      {(paymentMethod === 'آجل' || paymentMethod === 'دليفري') && (
        <div className="mb-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">بيانات العميل:</span>
            <button
              type="button"
              onClick={() => setShowAddCustomer(!showAddCustomer)}
              className="text-[10px] text-blue-600 font-bold hover:underline flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" />
              <span>عميل جديد</span>
            </button>
          </div>

          {showAddCustomer ? (
            <div className="space-y-1.5 pt-1 border-t border-slate-200">
              <input
                type="text"
                placeholder="اسم العميل الجديد..."
                value={newCustName}
                onChange={e => setNewCustName(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="text"
                placeholder="رقم الهاتف..."
                value={newCustPhone}
                onChange={e => setNewCustPhone(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white"
              />
              <input
                type="text"
                placeholder="العنوان بالتفصيل..."
                value={newCustAddr}
                onChange={e => setNewCustAddr(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white"
              />
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleAddCustomerSubmit}
                  className="px-2.5 py-1 bg-blue-600 text-white rounded text-[10px] font-bold"
                >
                  حفظ العميل
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCustomer(false)}
                  className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-[10px]"
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                type="text"
                list="customers-list"
                placeholder="اسم العميل أو حسابه..."
                value={clientName}
                onChange={e => onChangeClientName(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-xs"
              />
              <datalist id="customers-list">
                {customers.map(c => (
                  <option key={c.customer_id} value={c.customer_name} />
                ))}
              </datalist>

              {paymentMethod === 'دليفري' && (
                <>
                  <input
                    type="text"
                    placeholder="رقم هاتف العميل..."
                    value={clientPhone}
                    onChange={e => onChangeClientPhone(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                  <input
                    type="text"
                    placeholder="عنوان التوصيل..."
                    value={clientAddress}
                    onChange={e => onChangeClientAddress(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Tender & Change Calculation (Cash Mode) */}
      {paymentMethod === 'نقدي' && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">المدفوع من العميل:</span>
            <input
              type="number"
              step="any"
              value={paidAmount || ''}
              onChange={e => onChangePaidAmount(parseFloat(e.target.value) || 0)}
              placeholder={netTotal.toFixed(2)}
              className="w-24 px-2 py-1 text-left font-mono font-bold text-xs rounded-lg border border-slate-300 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Quick cash tender buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleQuickTender(0)}
              className="flex-1 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition-colors"
            >
              بالضبط
            </button>
            <button
              type="button"
              onClick={() => handleQuickTender(10)}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] font-bold transition-colors"
            >
              +10
            </button>
            <button
              type="button"
              onClick={() => handleQuickTender(50)}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] font-bold transition-colors"
            >
              +50
            </button>
            <button
              type="button"
              onClick={() => handleQuickTender(100)}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] font-bold transition-colors"
            >
              +100
            </button>
            <button
              type="button"
              onClick={() => handleQuickTender(200)}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] font-bold transition-colors"
            >
              +200
            </button>
          </div>

          {/* Change Display */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-600 font-medium">الباقي للعميل:</span>
            <span className={`font-mono font-bold text-sm ${changeAmount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
              {changeAmount.toFixed(2)} ج.م
            </span>
          </div>
        </div>
      )}

      {/* 6. Checkout Action Buttons */}
      <div className="mt-auto pt-2 space-y-2">
        {/* F9 Save & Finish */}
        <button
          type="button"
          disabled={!hasItems || isSaving}
          onClick={onSave}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>حفظ وإنهاء الفاتورة</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-700 text-emerald-100">
            F9
          </kbd>
        </button>

        {/* F10 Save & Print 80mm Receipt */}
        <button
          type="button"
          disabled={!hasItems || isSaving}
          onClick={onSaveAndPrint}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          <span>حفظ وطباعة إيصال</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-blue-700 text-blue-100">
            F10
          </kbd>
        </button>
      </div>

    </div>
  );
};
