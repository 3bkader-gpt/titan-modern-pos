import React, { useState, useEffect } from 'react';
import { Customer, DiscountMode, InsuranceProvider } from '../../../../shared/types';
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
  Coins,
  ShieldAlert,
  Shield
} from 'lucide-react';

interface PosCheckoutPanelProps {
  subtotal: number;
  discount: number;
  discountMode: DiscountMode;
  onChangeDiscountMode: (mode: DiscountMode) => void;
  discountInputValue: number;
  onChangeDiscountInputValue: (val: number) => void;
  totalCost?: number;
  isBelowCost?: boolean;
  isAdmin?: boolean;
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
  maxRecommendedDiscountPct?: number; // e.g. role max discount or 15% margin protection
  insuranceProviders?: InsuranceProvider[];
  selectedProviderId?: number;
  onChangeSelectedProviderId?: (id: number | undefined) => void;
  insuranceCopayPct?: number;
  onChangeInsuranceCopayPct?: (pct: number) => void;
  patientCardNumber?: string;
  onChangePatientCardNumber?: (num: string) => void;
}

export const PosCheckoutPanel: React.FC<PosCheckoutPanelProps> = ({
  subtotal,
  discount,
  discountMode,
  onChangeDiscountMode,
  discountInputValue,
  onChangeDiscountInputValue,
  totalCost = 0,
  isBelowCost = false,
  isAdmin = true,
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
  maxRecommendedDiscountPct = 15,
  insuranceProviders,
  selectedProviderId,
  onChangeSelectedProviderId,
  insuranceCopayPct = 20,
  onChangeInsuranceCopayPct,
  patientCardNumber = '',
  onChangePatientCardNumber
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustAddr, setNewCustAddr] = useState<string>('');

  const effectivePatientCopay = selectedProviderId
    ? Math.round((netTotal * (insuranceCopayPct / 100)) * 100) / 100
    : netTotal;
  const effectiveCompanyClaim = selectedProviderId
    ? Math.round((netTotal - effectivePatientCopay) * 100) / 100
    : 0;

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
      onChangePaidAmount(effectivePatientCopay);
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

        {/* Smart 4-Mode Discount Control */}
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700">نوع الخصم الذكي:</span>
            <span className="font-mono font-bold text-rose-700">
              {discount > 0 ? `-${discount.toFixed(2)} ج.م (${discountPct.toFixed(1)}%)` : '0.00 ج.م'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 text-[10px] font-bold">
            {(
              [
                ['AMOUNT', 'ج.م'],
                ['TOTAL_PCT', '% إجمالي'],
                ['PROFIT_PCT', '% من الربح ★'],
                ['WHOLESALE_COST', 'سعر الشراء']
              ] as Array<[DiscountMode, string]>
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeDiscountMode(m)}
                className={`py-1 px-1 rounded-lg border transition-colors cursor-pointer ${
                  discountMode === m
                    ? m === 'PROFIT_PCT'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-600">
              {discountMode === 'AMOUNT'
                ? 'مبلغ الخصم (ج.م):'
                : discountMode === 'TOTAL_PCT'
                  ? 'نسبة من الإجمالي (%):'
                  : discountMode === 'PROFIT_PCT'
                    ? 'نسبة من الربح فقط (%):'
                    : 'تطبيق تلقائي لسعر التكلفة'}
            </span>
            {discountMode !== 'WHOLESALE_COST' && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max={discountMode === 'TOTAL_PCT' || discountMode === 'PROFIT_PCT' ? 100 : undefined}
                  step="any"
                  value={discountInputValue || ''}
                  onChange={e => onChangeDiscountInputValue(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                  className="w-20 px-2 py-1 text-left font-mono font-bold text-xs rounded-lg border border-slate-300 bg-white focus:border-blue-500 outline-none"
                />
                <span className="text-slate-500 font-mono text-[11px]">
                  {discountMode === 'AMOUNT' ? 'ج.م' : '%'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Below-Cost Guard Alert */}
        {(isBelowCost || discountMode === 'WHOLESALE_COST') && (
          <div className="p-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-[10px] flex items-center gap-1.5 leading-tight font-bold">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>حارس التكلفة: الصافي عند التكلفة أو أقل — يتطلب تفويض المدير لغير الأدمن!</span>
          </div>
        )}

        {/* Margin Risk Alert */}
        {!isBelowCost && isDiscountRisky && (
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] flex items-center gap-1.5 leading-tight">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>تنبيه: الخصم ({discountPct.toFixed(1)}%) يتجاوز الحد الموصى به ({maxRecommendedDiscountPct}%)!</span>
          </div>
        )}

        {/* Large Net Total Hero Display */}
        <div className="p-3.5 rounded-xl bg-slate-900 text-white shadow-inner flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-300 font-medium">الصافي المطلوب دفعه:</span>
            {isAdmin && subtotal > 0 && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                netTotal >= totalCost ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
              }`}>
                الربح: {(netTotal - totalCost).toFixed(2)} ج.م
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black font-mono tracking-tight text-white">
              {netTotal.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-slate-300">ج.م</span>
          </div>
        </div>
      </div>

      {/* 2.5 Insurance Provider Selection */}
      <div className="mb-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            <span>تعاقد تأمين طبي:</span>
          </label>
          {selectedProviderId && (
            <button
              type="button"
              onClick={() => onChangeSelectedProviderId && onChangeSelectedProviderId(undefined)}
              className="text-[10px] text-rose-600 hover:underline cursor-pointer"
            >
              إلغاء التأمين
            </button>
          )}
        </div>

        <select
          value={selectedProviderId || ''}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
            if (onChangeSelectedProviderId) onChangeSelectedProviderId(val);
            if (val && insuranceProviders && onChangeInsuranceCopayPct) {
              const p = insuranceProviders.find(pr => pr.provider_id === val);
              if (p) onChangeInsuranceCopayPct(p.default_copay_pct);
            }
          }}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
        >
          <option value="">بدون تأمين (فاتورة عادية)</option>
          {insuranceProviders?.map((p) => (
            <option key={p.provider_id} value={p.provider_id}>
              {p.provider_name} (تحمل: {p.default_copay_pct}%)
            </option>
          ))}
        </select>

        {selectedProviderId && (
          <div className="mt-2 space-y-2 pt-2 border-t border-slate-200 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">نسبة تحمل المريض %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={insuranceCopayPct !== undefined ? insuranceCopayPct : 20}
                  onChange={(e) => onChangeInsuranceCopayPct && onChangeInsuranceCopayPct(parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">رقم كارت التأمين</label>
                <input
                  type="text"
                  placeholder="رقم الكارت..."
                  value={patientCardNumber || ''}
                  onChange={(e) => onChangePatientCardNumber && onChangePatientCardNumber(e.target.value)}
                  className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            {/* Split breakdown */}
            <div className="p-2 rounded-lg bg-blue-50/80 border border-blue-200 text-xs flex justify-between items-center">
              <div>
                <span className="text-[10px] text-blue-800 block">يدفعه المريض الآن:</span>
                <span className="font-mono font-bold text-blue-950">
                  {effectivePatientCopay.toFixed(2)} ج.م
                </span>
              </div>
              <div className="text-left">
                <span className="text-[10px] text-slate-500 block">مطالبة على الشركة:</span>
                <span className="font-mono font-bold text-slate-800">
                  {effectiveCompanyClaim.toFixed(2)} ج.م
                </span>
              </div>
            </div>
          </div>
        )}
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
              placeholder={effectivePatientCopay.toFixed(2)}
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
            {(() => {
              const displayChange = paidAmount > effectivePatientCopay ? paidAmount - effectivePatientCopay : 0;
              return (
                <span className={`font-mono font-bold text-sm ${displayChange > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {displayChange.toFixed(2)} ج.م
                </span>
              );
            })()}
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
