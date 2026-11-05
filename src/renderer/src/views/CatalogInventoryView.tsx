import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Item, InventoryFilterType, InventoryFilterResult } from '../../../shared/types';
import { 
  Search, 
  Filter, 
  Plus, 
  RefreshCw, 
  ChevronRight, 
  ChevronLeft, 
  SlidersHorizontal,
  History, 
  Edit3, 
  Sparkles, 
  AlertTriangle, 
  ShieldAlert, 
  Package, 
  TrendingUp, 
  CheckCircle2, 
  X,
  FileSpreadsheet
} from 'lucide-react';
import { ItemHistoryModal } from '../components/inventory/ItemHistoryModal';
import { EditStockModal } from '../components/inventory/EditStockModal';
import { DrugEyeSubstituteModal } from '../components/pos/DrugEyeSubstituteModal';

export const CatalogInventoryView: React.FC = () => {
  // State
  const [filterType, setFilterType] = useState<InventoryFilterType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(25);
  const [result, setResult] = useState<InventoryFilterResult>({ items: [], totalCount: 0, page: 1, limit: 25, totalPages: 1 });
  const [loading, setLoading] = useState<boolean>(false);

  // Modals state
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [substituteItem, setSubstituteItem] = useState<{
    item_id: number;
    item_name: string;
    generic_name?: string;
    consumer_price: number;
    package_units?: number;
  } | null>(null);

  // Search debounce ref
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load Inventory Data
  const loadData = useCallback(async (
    targetFilter: InventoryFilterType = filterType,
    targetPage: number = page,
    targetLimit: number = limit,
    targetQuery: string = searchQuery
  ) => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.getInventoryFilter(
          targetFilter,
          targetPage,
          targetLimit,
          targetQuery.trim() || undefined
        );
        if (res) {
          setResult({
            items: res.items || [],
            totalCount: res.totalCount ?? 0,
            page: res.page || 1,
            limit: res.limit || targetLimit,
            totalPages: res.totalPages || 1
          });
        }
      }
    } catch (err) {
      console.error('Error fetching inventory filter:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, page, limit, searchQuery]);

  // Initial load
  useEffect(() => {
    loadData(filterType, page, limit, searchQuery);
  }, [filterType, page, limit]);

  // Handle Search Input Change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setPage(1);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      loadData(filterType, 1, limit, val);
    }, 250);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setPage(1);
    loadData(filterType, 1, limit, '');
  };

  const handleFilterChange = (type: InventoryFilterType) => {
    setFilterType(type);
    setPage(1);
  };

  const handleItemSaved = (_savedItem: Item) => {
    setIsEditModalOpen(false);
    setEditingItem(null);
    loadData();
  };

  const openNewItemModal = () => {
    setEditingItem(null);
    setIsEditModalOpen(true);
  };

  const openEditItemModal = (item: Item) => {
    setEditingItem(item);
    setIsEditModalOpen(true);
  };

  // Helper for expiry styling
  const isExpiringSoon = (expiryStr?: string) => {
    if (!expiryStr) return false;
    const parts = expiryStr.split('-');
    if (parts.length === 2) {
      const month = parseInt(parts[0], 10);
      const year = parseInt(parts[1], 10);
      if (!isNaN(month) && !isNaN(year)) {
        const expDate = new Date(year, month - 1);
        const now = new Date();
        const sixMonthsLater = new Date();
        sixMonthsLater.setMonth(now.getMonth() + 6);
        return expDate <= sixMonthsLater;
      }
    }
    return false;
  };

  return (
    <div className="space-y-3 font-sans pb-8 select-none">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  إدارة الكتالوج والمخزون والجرد
                </h1>
                <kbd className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-300">
                  F7
                </kbd>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                متابعة 18,574 صنفاً، تعديل الأسعار، تسوية الأرصدة وتواريخ الصلاحية، واستكشاف البدائل.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            <button
              onClick={openNewItemModal}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة صنف جديد للكتالوج</span>
            </button>
          </div>
        </div>

        {/* 2. Filter Pills & Fast Search */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Quick Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-700 border border-slate-200'
              }`}
            >
              <span>الكل</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                filterType === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                18,574
              </span>
            </button>

            <button
              onClick={() => handleFilterChange('in_stock')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterType === 'in_stock'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-800 border border-emerald-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>متوفر بالمخزن</span>
            </button>

            <button
              onClick={() => handleFilterChange('zero_stock')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterType === 'zero_stock'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50/70 hover:bg-rose-100/70 text-rose-800 border border-rose-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>الأصناف الصفرية</span>
            </button>

            <button
              onClick={() => handleFilterChange('near_expiry')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterType === 'near_expiry'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50/70 hover:bg-amber-100/70 text-amber-800 border border-amber-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>قريب الانتهاء (Near Expiry)</span>
            </button>

            <button
              onClick={() => handleFilterChange('scheduled')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterType === 'scheduled'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-purple-50/70 hover:bg-purple-100/70 text-purple-800 border border-purple-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>أدوية الجدول</span>
            </button>

            <button
              onClick={() => handleFilterChange('recent_price_changes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterType === 'recent_price_changes'
                  ? 'bg-blue-800 text-white shadow-xs'
                  : 'bg-blue-50/70 hover:bg-blue-100/70 text-blue-900 border border-blue-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>تعديلات الأسعار الأخيرة</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[280px] lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="ابحث بالاسم أو الباركود أو المادة الفعالة..."
              className="w-full pr-9 pl-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-sans"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Main Data Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-2.5 px-3 w-16 text-center">كود</th>
                <th className="py-2.5 px-3 w-32 font-mono">الباركود</th>
                <th className="py-2.5 px-3 min-w-[240px]">اسم الصنف (تجاري / عربي)</th>
                <th className="py-2.5 px-3 min-w-[160px]">المادة الفعالة (Generic)</th>
                <th className="py-2.5 px-3 w-20 text-center">العبوة</th>
                <th className="py-2.5 px-3 w-24 text-left">سعر الجمهور</th>
                <th className="py-2.5 px-3 w-20 text-center">خصم %</th>
                <th className="py-2.5 px-3 w-24 text-left">سعر الشراء</th>
                <th className="py-2.5 px-3 w-20 text-center">الرصيد</th>
                <th className="py-2.5 px-3 w-24 text-center">الصلاحية</th>
                <th className="py-2.5 px-3 w-28 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <span className="text-xs font-medium">جاري تحميل أصناف المخزون...</span>
                    </div>
                  </td>
                </tr>
              ) : result.items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Package className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-slate-600">لا توجد نتائج مطابقة لبحثك</p>
                      <p className="text-xs text-slate-400">جرب البحث بكلمة أخرى أو تغيير الفلتر المختار.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                result.items.map((item) => {
                  const nearExp = isExpiringSoon(item.expiry_date);
                  const isZero = item.current_stock <= 0;
                  const hasPriceChange = item.previous_price && item.previous_price !== item.consumer_price;

                  return (
                    <tr 
                      key={item.item_id}
                      className="hover:bg-blue-50/40 transition-colors group"
                    >
                      {/* Code */}
                      <td className="py-2 px-3 text-center font-mono text-slate-500 font-bold">
                        {item.item_id}
                      </td>

                      {/* Barcode */}
                      <td className="py-2 px-3 font-mono text-slate-500 text-[11px] truncate max-w-[120px]" title={item.barcode || ''}>
                        {item.barcode || <span className="text-slate-300">بدون</span>}
                      </td>

                      {/* Trade Name */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                            {item.item_name_en}
                          </span>
                          {item.item_name_ar && (
                            <span className="text-[11px] text-slate-500 font-sans mt-0.5">
                              {item.item_name_ar}
                            </span>
                          )}
                          {item.tax_schedule_category && item.tax_schedule_category > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 font-semibold mt-0.5">
                              <ShieldAlert className="w-3 h-3" />
                              أدوية جدول مراقب
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Generic Name */}
                      <td className="py-2 px-3 text-slate-600 text-[11px] font-sans">
                        {item.generic_name ? (
                          <span className="truncate block max-w-[170px]" title={item.generic_name}>
                            {item.generic_name}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Package Units */}
                      <td className="py-2 px-3 text-center text-slate-600 font-mono">
                        {item.package_units || 1} ش
                      </td>

                      {/* Consumer Price */}
                      <td className="py-2 px-3 text-left font-mono">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-slate-900">
                            {item.consumer_price.toFixed(2)} ج.م
                          </span>
                          {hasPriceChange && (
                            <span className="text-[10px] text-amber-600 font-semibold line-through">
                              {item.previous_price?.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Discount % */}
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {item.discount_pct ? `${item.discount_pct}%` : '0%'}
                      </td>

                      {/* Buy Price */}
                      <td className="py-2 px-3 text-left font-mono text-slate-600">
                        {item.buy_price ? `${item.buy_price.toFixed(2)} ج.م` : '-'}
                      </td>

                      {/* Stock */}
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                          isZero
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : item.current_stock <= 2
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {item.current_stock}
                        </span>
                      </td>

                      {/* Expiry Date */}
                      <td className="py-2 px-3 text-center font-mono">
                        {item.expiry_date ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            nearExp 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : 'text-slate-600'
                          }`}>
                            {item.expiry_date}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Quick Edit */}
                          <button
                            onClick={() => openEditItemModal(item)}
                            className="p-1.5 rounded-md hover:bg-blue-100 text-slate-600 hover:text-blue-700 transition-colors"
                            title="تعديل سريع / تسوية رصيد وصلاحية"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* History */}
                          <button
                            onClick={() => setHistoryItemId(item.item_id)}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                            title="كارت حركة الصنف الشامل (مبيعات / مشتريات / أسعار)"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* DrugEye Alternatives */}
                          <button
                            onClick={() => setSubstituteItem({
                              item_id: item.item_id,
                              item_name: item.item_name_en,
                              generic_name: item.generic_name,
                              consumer_price: item.consumer_price,
                              package_units: item.package_units
                            })}
                            className="p-1.5 rounded-md hover:bg-purple-100 text-purple-600 hover:text-purple-800 transition-colors"
                            title="البحث عن البدائل الدوائية (DrugEye)"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Table Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-slate-500 font-medium">
            <span>
              إجمالي النتائج: <strong className="text-slate-800 font-mono">{(result.totalCount ?? 0).toLocaleString('en-US')}</strong> صنف
            </span>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <span>عرض في الصفحة:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={20}>20</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-mono">
              صفحة {result.page} من {result.totalPages || 1}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors"
                title="الصفحة السابقة"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}
                disabled={page >= result.totalPages || loading}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors"
                title="الصفحة التالية"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Modals */}
      {/* Item Full History Modal */}
      <ItemHistoryModal
        itemId={historyItemId}
        onClose={() => setHistoryItemId(null)}
      />

      {/* Edit Item / Adjust Stock Modal */}
      <EditStockModal
        item={editingItem}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingItem(null);
        }}
        onSaved={handleItemSaved}
      />

      {/* DrugEye Alternatives Modal */}
      <DrugEyeSubstituteModal
        isOpen={!!substituteItem}
        sourceItem={substituteItem}
        onClose={() => setSubstituteItem(null)}
        onSelectSubstitute={(newItem) => {
          setSubstituteItem(null);
          // Highlight or open full history/edit for the selected substitute
          setHistoryItemId(newItem.item_id);
        }}
      />
    </div>
  );
};
