import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Item, SearchScope, AdvancedDrugSearchFilter } from '../../../../shared/types';
import { Search, X, Sparkles, SlidersHorizontal, PackageCheck, CornerDownLeft, Copy, Check } from 'lucide-react';

interface AdvancedDrugFinderModalProps {
  isOpen: boolean;
  initialQuery?: string;
  onClose: () => void;
  onSelectItem: (item: Item, unitType?: 'pack' | 'unit') => void;
  onOpenDrugEye?: (item: Item) => void;
}

const SCOPE_OPTIONS: Array<{ value: SearchScope; label: string; hint: string }> = [
  { value: 'ALL', label: 'كل الدليل (All)', hint: 'كافة الأصناف (18,704+)' },
  { value: 'OUR_LIST', label: 'قائمتنا (Our List)', hint: 'المتداول أو برصيد أو حركة' },
  { value: 'IN_STOCK', label: 'الرصيد الموجب فقط', hint: 'المتاح حالياً للبيع' }
];

const SYNTAX_HINTS = [
  { token: '.1286', desc: 'نهاية الباركود (.آخر أرقام)' },
  { token: 'AU*625', desc: 'نجوم متعددة (اسم * تركيز)' },
  { token: '=OJMANTYN', desc: 'بحث صوتي إملائي (=نطق)' }
];

export const AdvancedDrugFinderModal: React.FC<AdvancedDrugFinderModalProps> = ({
  isOpen,
  initialQuery = '',
  onClose,
  onSelectItem,
  onOpenDrugEye
}) => {
  const [query, setQuery] = useState<string>(initialQuery);
  const [scope, setScope] = useState<SearchScope>('ALL');
  const [genericName, setGenericName] = useState<string>('');
  const [producer, setProducer] = useState<string>('');
  const [shortCode, setShortCode] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [showFilters, setShowFilters] = useState<boolean>(true);
  const [results, setResults] = useState<Item[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialQuery) setQuery(initialQuery);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 40);
    }
  }, [isOpen, initialQuery]);

  const runSearch = useCallback(async () => {
    if (!isOpen || !window.electronAPI?.advancedSearchItems) return;
    setLoading(true);
    try {
      const filter: AdvancedDrugSearchFilter = {
        query: query.trim(),
        scope,
        genericName: genericName.trim() || undefined,
        producer: producer.trim() || undefined,
        shortCode: shortCode.trim() || undefined,
        minPrice: minPrice !== '' ? Number(minPrice) : null,
        maxPrice: maxPrice !== '' ? Number(maxPrice) : null,
        limit: 80
      };
      const rows = await window.electronAPI.advancedSearchItems(filter);
      setResults(rows || []);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Advanced search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [isOpen, query, scope, genericName, producer, shortCode, minPrice, maxPrice]);

  useEffect(() => {
    if (!isOpen) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSearch();
    }, 150);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, runSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex(prev => (prev + 1 < results.length ? prev + 1 : 0));
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : results.length - 1));
      }
      return;
    }
    if (e.key === 'Enter' && results.length > 0 && results[selectedIndex]) {
      e.preventDefault();
      onSelectItem(results[selectedIndex], 'pack');
      onClose();
    }
  };

  const handleCopyBarcode = (e: React.MouseEvent, item: Item) => {
    e.stopPropagation();
    const text = item.barcode || String(item.item_id);
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(item.item_id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <div
      data-modal-open="true"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center">
              <Search className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h2 className="text-sm font-black">محرك البحث المتقدم بـ 9 طرق (Ctrl+F)</h2>
              <p className="text-[11px] text-slate-300">بحث بالاسم، نهاية الباركود (.685)، النجوم (AU*625)، الصوتي (=OJMANTYN)، الكود السريع، المادة الفعالة، ونطاق السعر</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                showFilters ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              فلاتر متقدمة
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Query Bar + Syntax Hints + 3 Scope Toggle */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex flex-col md:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-blue-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="اكتب اسم الصنف، أو .1286 لنهاية الباركود، أو AU*625، أو =OJMANTYN للبحث الصوتي..."
                className="w-full pr-10 pl-3 py-2.5 rounded-xl bg-white border-2 border-blue-200 focus:border-blue-600 focus:outline-hidden text-sm font-bold text-slate-900"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* 3-Scope Toggle */}
            <div className="flex rounded-xl bg-slate-200/80 p-1 gap-1 shrink-0">
              {SCOPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.hint}
                  onClick={() => setScope(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    scope === opt.value
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clickable Syntax Helper Chips */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-bold text-slate-500">أمثلة سريعة:</span>
            {SYNTAX_HINTS.map(h => (
              <button
                key={h.token}
                type="button"
                onClick={() => {
                  setQuery(h.token);
                  inputRef.current?.focus();
                }}
                className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-blue-400 text-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <span className="font-mono font-bold text-blue-700" dir="ltr">{h.token}</span>
                <span className="text-slate-500">{h.desc}</span>
              </button>
            ))}
          </div>

          {/* Structured Filters */}
          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1">
              <input
                type="text"
                value={genericName}
                onChange={e => setGenericName(e.target.value)}
                placeholder="المادة الفعالة (Generic)"
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-medium"
              />
              <input
                type="text"
                value={producer}
                onChange={e => setProducer(e.target.value)}
                placeholder="الشركة المنتجة (Producer)"
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-medium"
              />
              <input
                type="text"
                value={shortCode}
                onChange={e => setShortCode(e.target.value)}
                placeholder="الكود المختصر (Short Code)"
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono"
              />
              <input
                type="number"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                placeholder="أقل سعر (ج.م)"
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono"
              />
              <input
                type="number"
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                placeholder="أعلى سعر (ج.م)"
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono"
              />
            </div>
          )}
        </div>

        {/* Results Table */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="py-12 text-center text-sm text-blue-600 font-bold">جاري البحث في الدليل...</div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400 font-semibold">
              لا توجد نتائج مطابقة. جرّب البحث الصوتي (<span dir="ltr" className="font-mono">=</span>) أو النجوم (<span dir="ltr" className="font-mono">*</span>) أو تغيير النطاق إلى "كل الدليل".
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const inStock = item.current_stock > 0;
              return (
                <div
                  key={item.item_id}
                  onClick={() => {
                    onSelectItem(item, 'pack');
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 border-r-4 border-r-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 truncate" dir="ltr">{item.item_name_en}</span>
                      {item.item_name_ar && (
                        <span className="text-xs text-slate-600 font-medium truncate">{item.item_name_ar}</span>
                      )}
                      {item.short_code && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[10px] font-bold">
                          #{item.short_code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                      <span className="font-mono">ID: {item.item_id}</span>
                      {item.barcode && <span className="font-mono">BC: {item.barcode}</span>}
                      {item.generic_name && <span className="text-blue-700 font-semibold">{item.generic_name}</span>}
                      {item.producer && <span>{item.producer}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${
                      inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-50 text-rose-600'
                    }`}>
                      <PackageCheck className="w-3 h-3" />
                      {item.current_stock}
                    </span>

                    <div className="text-left w-20">
                      <div className="text-sm font-black text-slate-900 font-mono">
                        {(item.temp_price_active === 1 && Number(item.temp_price || 0) > 0 ? Number(item.temp_price) : item.consumer_price).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">ج.م</div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleCopyBarcode(e, item)}
                      title="نسخ الباركود"
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer"
                    >
                      {copiedId === item.item_id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>

                    {onOpenDrugEye && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDrugEye(item);
                        }}
                        title="المثائل والبدائل"
                        className="p-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item, 'unit');
                        onClose();
                      }}
                      title="إضافة شريط للكاشير"
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-[11px] font-bold cursor-pointer transition-colors"
                    >
                      شريط
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>النتائج المعروضة: <strong className="text-slate-800">{results.length}</strong></div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><CornerDownLeft className="w-3.5 h-3.5" /> Enter لإضافة علبة للكاشير</span>
            <span>↑↓ للتنقل • Esc للإغلاق</span>
          </div>
        </div>
      </div>
    </div>
  );
};
