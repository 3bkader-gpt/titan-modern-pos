import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Sparkles, 
  ShieldAlert, 
  Pill, 
  Barcode, 
  Building2, 
  X, 
  ShieldCheck,
  Check,
  Package
} from 'lucide-react';
import { Item, MedicalAlert } from '../../../shared/types';

interface DrugExplorerProps {
  onSelectItem?: (item: Item) => void;
}

export const DrugExplorer: React.FC<DrugExplorerProps> = ({ onSelectItem }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterInStock, setFilterInStock] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [alternatives, setAlternatives] = useState<Item[]>([]);
  const [medicalAlerts, setMedicalAlerts] = useState<MedicalAlert[]>([]);
  const [searchLatency, setSearchLatency] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingAlts, setLoadingAlts] = useState<boolean>(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    handleSearch('', false);
  }, []);

  const handleSearch = async (query: string, inStockOnly: boolean) => {
    setLoading(true);
    const start = performance.now();
    try {
      if (window.electronAPI) {
        const results = await window.electronAPI.searchItems(query, inStockOnly, 50);
        const latency = performance.now() - start;
        setSearchResults(results);
        setSearchLatency(Number(latency.toFixed(2)));

        if (results.length > 0 && (!selectedItem || query.length > 0)) {
          selectItem(results[0]);
        }
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectItem = async (item: Item) => {
    setSelectedItem(item);
    if (onSelectItem) {
      onSelectItem(item);
    }

    if (!window.electronAPI) return;

    try {
      const alerts = await window.electronAPI.getMedicalAlerts(item.generic_name, item.tax_schedule_category);
      setMedicalAlerts(alerts);
    } catch (err) {
      console.error('Error fetching medical alerts:', err);
      setMedicalAlerts([]);
    }

    setLoadingAlts(true);
    try {
      const alts = await window.electronAPI.getAlternatives(item.item_id);
      setAlternatives(alts);
    } catch (err) {
      console.error('Error fetching alternatives:', err);
      setAlternatives([]);
    } finally {
      setLoadingAlts(false);
    }
  };

  const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    handleSearch(val, filterInStock);
  };

  const toggleInStock = () => {
    const nextVal = !filterInStock;
    setFilterInStock(nextVal);
    handleSearch(searchQuery, nextVal);
  };

  const clearSearch = () => {
    setSearchQuery('');
    handleSearch('', filterInStock);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 h-full select-none font-sans">
      {/* Left Column: Drug Catalog & Instant Search (5 cols) */}
      <div className="lg:col-span-5 flex flex-col h-[700px] bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Search Bar - Clean Light Styling */}
        <div className="p-3 border-b border-slate-200 bg-slate-50/80 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={onQueryChange}
              placeholder="ابحث باسم الدواء، المادة الفعالة، أو الباركود..."
              dir="ltr"
              className="w-full bg-white border-2 border-slate-200 focus:border-blue-600 rounded-lg pl-9 pr-8 py-2 text-[14px] text-slate-800 placeholder-slate-400 focus:outline-none transition-colors shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2.5 top-2.5 p-0.5 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={filterInStock}
                onChange={toggleInStock}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className={filterInStock ? 'text-blue-700 font-bold' : 'text-slate-600'}>
                المتوفر في المخزن فقط
              </span>
            </label>

            {searchLatency !== null && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                <span className="text-slate-700 font-bold">{searchResults.length}</span>
                <span className="text-slate-400">صنف في النتائج</span>
              </div>
            )}
          </div>
        </div>

        {/* Catalog List - Crisp Light Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {searchResults.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <Pill className="w-10 h-10 mb-2 opacity-30 text-slate-400" />
              <p className="text-sm text-slate-600 font-medium">لا توجد نتائج مطابقة</p>
              <p className="text-xs text-slate-400 mt-1">جرّب البحث بجزء من اسم الدواء أو الباركود</p>
            </div>
          ) : (
            searchResults.map((item) => {
              const isSelected = selectedItem?.item_id === item.item_id;
              const hasStock = item.current_stock > 0;

              return (
                <div
                  key={item.item_id}
                  onClick={() => selectItem(item)}
                  className={`px-3.5 py-2.5 cursor-pointer transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-50/90 border-r-4 border-blue-600 text-blue-950'
                      : 'hover:bg-slate-50/90 text-slate-700'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2" dir="ltr">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-slate-400 shrink-0">
                        #{item.item_id}
                      </span>
                      <span className="text-[14px] font-bold truncate text-slate-800">
                        {item.item_name_en}
                      </span>
                      {item.tax_schedule_category ? (
                        <span className="text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded shrink-0">
                          جدول {item.tax_schedule_category}
                        </span>
                      ) : null}
                    </div>

                    {/* Generic Name & Producer */}
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      {item.generic_name ? (
                        <span className="text-blue-600 font-mono truncate text-[11px] font-semibold">
                          {item.generic_name}
                        </span>
                      ) : null}
                      {item.producer && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500 text-[11px] truncate">
                            {item.producer}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-left shrink-0 pl-1 font-mono">
                    <div className="text-[15px] font-bold text-emerald-700" data-tabular>
                      {item.consumer_price.toFixed(2)}
                      <span className="text-xs font-sans font-normal text-slate-500 mr-1">ج.م</span>
                    </div>
                    <div className="mt-1">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full font-sans inline-block ${
                          hasStock
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {hasStock ? `${item.current_stock} متوفر` : 'غير متوفر'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Drug Profile & DrugEye Alternatives (7 cols) */}
      <div className="lg:col-span-7 flex flex-col h-[700px] space-y-3 overflow-y-auto pr-0.5">
        {selectedItem ? (
          <>
            {/* 1. Main Drug Specification Card */}
            <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
              {/* Header: Trade Name & Producer */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3" dir="ltr">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      #{selectedItem.item_id}
                    </span>
                    <h2 className="text-lg font-bold text-slate-900 tracking-wide">
                      {selectedItem.item_name_en}
                    </h2>
                    {selectedItem.tax_schedule_category ? (
                      <span className="text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 px-2 py-0.5 rounded">
                        جدول {selectedItem.tax_schedule_category} (أدوية مراقبة)
                      </span>
                    ) : null}
                  </div>

                  {selectedItem.producer && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5 font-mono">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{selectedItem.producer}</span>
                    </div>
                  )}
                </div>

                {/* Price Display */}
                <div className="text-right bg-emerald-50/70 border border-emerald-200/80 px-3.5 py-2 rounded-xl">
                  <span className="text-xs block text-slate-600 font-medium font-sans">سعر الجمهور</span>
                  <span className="text-xl font-mono font-bold text-emerald-700" data-tabular>
                    {selectedItem.consumer_price.toFixed(2)}
                    <span className="text-xs font-sans font-normal text-slate-500 mr-1">ج.م</span>
                  </span>
                </div>
              </div>

              {/* 4-Cell Clinical Matrix */}
              <div className="grid grid-cols-4 gap-2.5 py-3 border-b border-slate-100">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  <span className="text-xs text-slate-500 block mb-0.5 font-sans">الرصيد بالمخزن</span>
                  <span className="text-sm font-bold text-slate-800 font-mono">
                    {selectedItem.current_stock}{' '}
                    <span className="text-xs font-normal text-slate-500 font-sans">
                      ({selectedItem.package_units || 1} و/ع)
                    </span>
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  <span className="text-xs text-slate-500 block mb-0.5 font-sans">سعر الشراء</span>
                  {(() => {
                    const cp = selectedItem.consumer_price;
                    const bp = selectedItem.buy_price || 0;
                    const disc = (selectedItem.discount_pct && selectedItem.discount_pct > 0)
                      ? selectedItem.discount_pct
                      : ((selectedItem as any).pharmacy_discount_percent && (selectedItem as any).pharmacy_discount_percent > 0
                        ? (selectedItem as any).pharmacy_discount_percent : 25);
                    const effectiveBp = (bp <= 0 || bp < cp * 0.40)
                      ? Math.round(cp * (1 - disc / 100) * 100) / 100
                      : bp;
                    return (
                      <span className="text-sm font-bold text-slate-800 font-mono">
                        {effectiveBp > 0 ? `${effectiveBp.toFixed(2)} ج.م` : 'غير مسجل'}
                      </span>
                    );
                  })()}
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  <span className="text-xs text-slate-500 block mb-0.5 font-sans">هامش الربح</span>
                  {(() => {
                    const cp = selectedItem.consumer_price;
                    const bp = selectedItem.buy_price || 0;
                    const disc = (selectedItem.discount_pct && selectedItem.discount_pct > 0)
                      ? selectedItem.discount_pct
                      : ((selectedItem as any).pharmacy_discount_percent && (selectedItem as any).pharmacy_discount_percent > 0
                        ? (selectedItem as any).pharmacy_discount_percent : 25);
                    const effectiveBp = (bp <= 0 || bp < cp * 0.40)
                      ? Math.round(cp * (1 - disc / 100) * 100) / 100
                      : bp;
                    const margin = cp > 0 && effectiveBp > 0
                      ? (((cp - effectiveBp) / cp) * 100).toFixed(1)
                      : null;
                    return (
                      <span className="text-sm font-bold text-emerald-700 font-mono">
                        {margin ? `${margin}%` : '—'}
                      </span>
                    );
                  })()}
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  <span className="text-xs text-slate-500 block mb-0.5 font-sans">الصلاحية</span>
                  <span className="text-sm font-bold text-slate-800 truncate block font-mono">
                    {selectedItem.expiry_date || 'غير محدد'}
                  </span>
                </div>
              </div>

              {/* Generic Active Ingredient & Barcode */}
              <div className="pt-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2" dir="ltr">
                  <span className="text-slate-400 font-sans">المادة الفعالة:</span>
                  <span className="text-blue-700 font-bold font-mono text-[13px]">
                    {selectedItem.generic_name || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 font-mono" dir="ltr">
                  <Barcode className="w-4 h-4 text-slate-400" />
                  <span>{selectedItem.barcode || '—'}</span>
                </div>
              </div>
            </div>

            {/* 2. Medical Alerts Box */}
            <div className="space-y-2">
              {medicalAlerts.length > 0 ? (
                medicalAlerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex items-start gap-3 ${
                      alert.severity === 'danger'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${
                      alert.severity === 'danger' ? 'text-rose-600' : 'text-amber-600'
                    }`} />
                    <div className="text-xs leading-relaxed">
                      <div className="font-bold flex items-center gap-2">
                        <span>{alert.title}</span>
                        {alert.condition && (
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-800 font-bold">
                            {alert.condition}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-700 mt-1">
                        {alert.message}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-800 flex items-center gap-2.5 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">
                    الصنف مصنف للاستخدام العام (OTC) - لا توجد قيود جدولية أو موانع مسجلة بقاعدة بيانات الحمل.
                  </span>
                </div>
              )}
            </div>

            {/* 3. DrugEye Alternatives Matrix Table */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800 tracking-wide">
                    البدائل بنفس المادة الفعالة
                  </span>
                </div>
                <span className="text-xs font-mono text-slate-500 font-semibold">
                  {alternatives.length} بديل
                </span>
              </div>

              {loadingAlts ? (
                <div className="py-8 text-center text-xs font-mono text-slate-400">
                  جاري البحث عن البدائل...
                </div>
              ) : alternatives.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  لا توجد بدائل مسجلة بنفس المادة الفعالة في الكتالوج الحالي.
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[260px] divide-y divide-slate-100">
                  {alternatives.map((alt) => {
                    const priceDiff = alt.consumer_price - selectedItem.consumer_price;
                    const hasStock = alt.current_stock > 0;

                    return (
                      <div
                        key={alt.item_id}
                        onClick={() => selectItem(alt)}
                        className="py-2.5 px-3 hover:bg-blue-50/50 flex items-center justify-between cursor-pointer group transition-colors rounded-lg"
                        dir="ltr"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="text-[14px] font-bold text-slate-800 group-hover:text-blue-700 truncate">
                            {alt.item_name_en}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate mt-0.5">
                            {alt.producer || 'Standard Lab'}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                          {/* Price & Price Diff */}
                          <div className="text-right">
                            <div className="font-bold text-emerald-700 text-sm" data-tabular>
                              {alt.consumer_price.toFixed(2)} ج.م
                            </div>
                            <div className={`text-[11px] font-bold ${
                              priceDiff > 0 
                                ? 'text-amber-700' 
                                : priceDiff < 0 
                                ? 'text-emerald-700' 
                                : 'text-slate-400'
                            }`}>
                              {priceDiff === 0 
                                ? 'نفس السعر' 
                                : `${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)} ج.م`}
                            </div>
                          </div>

                          {/* Stock status tag */}
                          <span
                            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full font-sans ${
                              hasStock
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {hasStock ? `${alt.current_stock} متوفر` : 'غير متوفر'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
            <Pill className="w-12 h-12 mb-3 text-slate-300" />
            <span className="text-sm text-slate-600 font-medium">اختر صنفاً لعرض بطاقة المواصفات والبدائل</span>
          </div>
        )}
      </div>
    </div>
  );
};
