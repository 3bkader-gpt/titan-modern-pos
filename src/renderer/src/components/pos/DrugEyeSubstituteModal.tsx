import React, { useState, useEffect } from 'react';
import { Item } from '../../../shared/types';
import { Sparkles, X, Check, ArrowRightLeft, AlertCircle, PackageCheck } from 'lucide-react';
import { playBeepSuccess } from './soundEffects';

interface DrugEyeSubstituteModalProps {
  isOpen: boolean;
  sourceItem: {
    item_id: number;
    item_name: string;
    generic_name?: string;
    consumer_price: number;
    package_units?: number;
  } | null;
  onClose: () => void;
  onSelectSubstitute: (newItem: Item) => void;
}

export const DrugEyeSubstituteModal: React.FC<DrugEyeSubstituteModalProps> = ({
  isOpen,
  sourceItem,
  onClose,
  onSelectSubstitute
}) => {
  const [substitutes, setSubstitutes] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  useEffect(() => {
    if (isOpen && sourceItem) {
      setLoading(true);
      setSelectedIndex(0);
      if (window.electronAPI) {
        window.electronAPI.getAlternatives(sourceItem.item_id)
          .then(data => {
            setSubstitutes(data || []);
          })
          .catch(err => {
            console.error('Failed to get alternatives:', err);
            setSubstitutes([]);
          })
          .finally(() => {
            setLoading(false);
          });
      }
    }
  }, [isOpen, sourceItem]);

  if (!isOpen || !sourceItem) return null;

  const handleSelect = (item: Item) => {
    playBeepSuccess();
    onSelectSubstitute(item);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                بدائل المادة الفعالة (DrugEye Alternatives - Alt+A)
              </h3>
              <p className="text-xs text-slate-500 font-sans">
                المادة الفعالة: <span className="font-semibold text-slate-700 font-mono">{sourceItem.generic_name || 'غير محددة'}</span>
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

        {/* Source Item Context Banner */}
        <div className="px-6 py-3 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500">الصنف المطلوب استبداله: </span>
            <span className="font-bold text-slate-900">{sourceItem.item_name}</span>
          </div>
          <div className="font-mono text-slate-700 font-bold">
            {sourceItem.consumer_price.toFixed(2)} ج.م
          </div>
        </div>

        {/* Substitutes List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50">
          {loading ? (
            <div className="h-44 flex items-center justify-center text-xs text-slate-400">
              جاري البحث عن البدائل الدوائية المتوفرة...
            </div>
          ) : substitutes.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center text-slate-400">
              <AlertCircle className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">لا توجد بدائل مسجلة بنفس المادة الفعالة</p>
              <p className="text-[11px] text-slate-400 mt-1">تأكد من تسجيل المادة الفعالة في بطاقة الصنف</p>
            </div>
          ) : (
            substitutes.map((item, idx) => {
              const inStock = item.current_stock > 0;
              const priceDiff = item.consumer_price - sourceItem.consumer_price;
              const isSelected = selectedIndex === idx;

              return (
                <div
                  key={item.item_id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-100 shadow-2xs'
                      : inStock
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-white/70 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {item.item_name_en}
                      </h4>
                      {inStock ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                          متوفر ({item.current_stock})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                          غير متوفر
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-2">
                      <span>{item.item_name_ar || 'بدون اسم عربي'}</span>
                      {item.producer && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">{item.producer}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Pricing & Selection */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left font-mono">
                      <div className="text-xs font-bold text-slate-900">
                        {item.consumer_price.toFixed(2)} ج.م
                      </div>
                      <div className={`text-[10px] ${
                        priceDiff === 0 ? 'text-slate-400' : priceDiff > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}>
                        {priceDiff === 0 ? 'نفس السعر' : priceDiff > 0 ? `+${priceDiff.toFixed(2)} ج.م` : `${priceDiff.toFixed(2)} ج.م`}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(item);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-2xs hover:shadow transition-all"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>اختيار البديل</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {substitutes.length} بدائل مطابقة بنفس المادة الفعالة
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            إلغاء (Esc)
          </button>
        </div>

      </div>
    </div>
  );
};
