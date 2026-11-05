import React, { useState, useEffect } from 'react';
import { Item, SaveItemPayload } from '../../../shared/types';
import { Edit3, Plus, X, Check, AlertCircle, Barcode, Calendar, ShieldAlert } from 'lucide-react';

interface EditStockModalProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (savedItem: Item) => void;
}

export const EditStockModal: React.FC<EditStockModalProps> = ({
  item,
  isOpen,
  onClose,
  onSaved
}) => {
  const [formData, setFormData] = useState<SaveItemPayload>({
    item_id: undefined,
    barcode: '',
    item_name_en: '',
    item_name_ar: '',
    generic_name: '',
    producer: '',
    category: '',
    consumer_price: 0,
    package_units: 1,
    buy_price: 0,
    discount_pct: 0,
    current_stock: 0,
    expiry_date: '',
    tax_schedule_category: 0
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setFormData({
          item_id: item.item_id,
          barcode: item.barcode || '',
          item_name_en: item.item_name_en,
          item_name_ar: item.item_name_ar || '',
          generic_name: item.generic_name || '',
          producer: item.producer || '',
          category: item.category || 'عام',
          consumer_price: item.consumer_price,
          package_units: item.package_units || 1,
          buy_price: item.buy_price || 0,
          discount_pct: item.discount_pct || 0,
          current_stock: item.current_stock,
          expiry_date: item.expiry_date || '',
          tax_schedule_category: item.tax_schedule_category || 0
        });
      } else {
        // Brand new item mode
        setFormData({
          item_id: undefined,
          barcode: '',
          item_name_en: '',
          item_name_ar: '',
          generic_name: '',
          producer: '',
          category: 'عام',
          consumer_price: 0,
          package_units: 1,
          buy_price: 0,
          discount_pct: 0,
          current_stock: 0,
          expiry_date: '',
          tax_schedule_category: 0
        });
      }
      setError(null);
    }
  }, [isOpen, item]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.item_name_en.trim()) {
      setError('يرجى إدخال اسم الدواء التجاري بالإنجليزية');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (window.electronAPI) {
        const saved = await window.electronAPI.saveOrUpdateItem(formData);
        onSaved(saved);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`خطأ أثناء الحفظ: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const isNew = !item;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isNew ? 'bg-emerald-50 border border-emerald-200 text-emerald-600' : 'bg-blue-50 border border-blue-200 text-blue-600'
            }`}>
              {isNew ? <Plus className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isNew ? 'إضافة صنف دوائي جديد للكتالوج' : `تعديل بطاقة الصنف وتسوية الرصيد (#${item.item_id})`}
              </h3>
              <p className="text-xs text-slate-500 font-sans">
                {isNew ? 'تسجيل دواء جديد مع توليد باركود تلقائي' : item.item_name_en}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white text-xs">
          
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Names and Barcode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                الاسم التجاري بالإنجليزية (Trade Name) *
              </label>
              <input
                type="text"
                required
                value={formData.item_name_en}
                onChange={e => setFormData({ ...formData, item_name_en: e.target.value })}
                placeholder="e.g. PANADOL EXTRA 24 TAB"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-semibold text-slate-900 outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                الاسم بالعربية
              </label>
              <input
                type="text"
                value={formData.item_name_ar || ''}
                onChange={e => setFormData({ ...formData, item_name_ar: e.target.value })}
                placeholder="بنادول اكسترا 24 قرص"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900 outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                الباركود الدولي أو المحلي
              </label>
              <div className="relative">
                <Barcode className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={formData.barcode || ''}
                  onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder={isNew ? 'يترك فارغاً للتوليد التلقائي (LOC...)' : 'الباركود'}
                  className="w-full pl-3 pr-9 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-slate-900 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                المادة الفعالة (Generic Active Ingredient)
              </label>
              <input
                type="text"
                value={formData.generic_name || ''}
                onChange={e => setFormData({ ...formData, generic_name: e.target.value })}
                placeholder="PARACETAMOL + CAFFEINE"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-slate-800 outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                الشركة المصنعة (Producer)
              </label>
              <input
                type="text"
                value={formData.producer || ''}
                onChange={e => setFormData({ ...formData, producer: e.target.value })}
                placeholder="GSK, NOVARTIS, EVA, ..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-800 outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                عدد الوحدات / الشرائط بالعلبة (Package Units)
              </label>
              <input
                type="number"
                min="1"
                value={formData.package_units || 1}
                onChange={e => setFormData({ ...formData, package_units: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono font-bold text-slate-800 outline-none"
              />
            </div>
          </div>

          {/* 2. Pricing & Stock */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                سعر الجمهور (ج.م) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={formData.consumer_price || ''}
                onChange={e => setFormData({ ...formData, consumer_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 font-mono font-bold text-slate-900 outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                سعر التكلفة / الشراء
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={formData.buy_price || ''}
                onChange={e => setFormData({ ...formData, buy_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 font-mono text-slate-800 outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                الرصيد الفعلي الحالي
              </label>
              <input
                type="number"
                step="any"
                value={formData.current_stock ?? 0}
                onChange={e => setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 font-mono font-bold text-blue-700 outline-none"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                تاريخ الصلاحية
              </label>
              <input
                type="text"
                placeholder="MM-YYYY (e.g. 10-2028)"
                value={formData.expiry_date || ''}
                onChange={e => setFormData({ ...formData, expiry_date: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-blue-500 font-mono text-slate-800 outline-none"
              />
            </div>
          </div>

          {/* 3. Schedule Drug Category */}
          <div>
            <label className="font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>تصنيف الأدوية الخاضعة للرقابة (جداول المخدرات والمؤثرات):</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, tax_schedule_category: 0 })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  formData.tax_schedule_category === 0
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                عادي (بدون جدول)
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, tax_schedule_category: 1 })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  formData.tax_schedule_category === 1
                    ? 'bg-rose-50 border-rose-500 text-rose-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                جدول أول (مخدرات)
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, tax_schedule_category: 2 })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  formData.tax_schedule_category === 2
                    ? 'bg-amber-50 border-amber-500 text-amber-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                جدول ثانٍ (مؤثرات نفسية)
              </button>
            </div>
          </div>

          {/* Modal Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : isNew ? 'إضافة الصنف للكتالوج' : 'حفظ التعديلات والتسوية'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
