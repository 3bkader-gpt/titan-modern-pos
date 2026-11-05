import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShortageItem, Supplier, Item } from '../../../shared/types';
import { 
  ClipboardList, 
  Search, 
  Filter, 
  Plus, 
  Trash2, 
  ArrowRight, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  Truck, 
  AlertCircle, 
  PackageCheck, 
  Edit3, 
  Sparkles, 
  Check, 
  X,
  Building2,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';

interface ShortagesViewProps {
  onTransferToPurchases?: (selectedItems: Array<{
    item_id: number;
    item_name_en: string;
    item_name_ar?: string;
    quantity: number;
    consumer_price: number;
    buy_price: number;
    discount_pct?: number;
    expiry_date?: string;
  }>) => void;
}

export const ShortagesView: React.FC<ShortagesViewProps> = ({
  onTransferToPurchases
}) => {
  // State
  const [shortages, setShortages] = useState<ShortageItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination (Default: 50 items per page for instantaneous 60 FPS rendering)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Selection for order conversion
  const [selectedShortageIds, setSelectedShortageIds] = useState<Set<number>>(new Set());

  // Add Shortage Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [itemSearchText, setItemSearchText] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [searchingItem, setSearchingItem] = useState<boolean>(false);
  const [selectedItemToAdd, setSelectedItemToAdd] = useState<Item | null>(null);
  const [addQuantity, setAddQuantity] = useState<number>(1);
  const [addSupplierId, setAddSupplierId] = useState<number | ''>('');
  const [savingAdd, setSavingAdd] = useState<boolean>(false);

  // Status message
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Load suppliers ONCE on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getSuppliers().then((sups) => setSuppliers(sups || []));
    }
  }, []);

  // Debounce search input to avoid IPC flooding and UI re-renders on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load Shortages
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const shortagesData = await window.electronAPI.getShortages(
          selectedSupplierId !== '' ? Number(selectedSupplierId) : undefined,
          searchQuery.trim() || undefined
        );
        setShortages(shortagesData || []);
      }
    } catch (err) {
      console.error('Error fetching shortages:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSupplierId, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Search input debounce for manual item addition
  useEffect(() => {
    if (!itemSearchText.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingItem(true);
      try {
        if (window.electronAPI) {
          const res = await window.electronAPI.searchItems(itemSearchText.trim(), 8);
          setSearchResults(res || []);
        }
      } catch (err) {
        console.error('Failed to search items:', err);
      } finally {
        setSearchingItem(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [itemSearchText]);

  // Update shortage quantity inline
  const handleUpdateQuantity = async (shortage: ShortageItem, newQty: number) => {
    if (newQty < 1) return;
    try {
      if (window.electronAPI) {
        await window.electronAPI.addOrUpdateShortage(
          shortage.item_id,
          newQty,
          shortage.supplier_id
        );
        setShortages((prev) =>
          prev.map((s) =>
            s.shortage_id === shortage.shortage_id
              ? { ...s, quantity: newQty }
              : s
          )
        );
      }
    } catch (err) {
      console.error('Failed to update shortage quantity:', err);
    }
  };

  // Delete shortage
  const handleDeleteShortage = async (shortageId: number) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.removeShortage(shortageId);
        setShortages((prev) => prev.filter((s) => s.shortage_id !== shortageId));
        setSelectedShortageIds((prev) => {
          const next = new Set(prev);
          next.delete(shortageId);
          return next;
        });
        setToastMessage({ text: 'تم حذف الصنف من كشكول النواقص', type: 'success' });
      }
    } catch (err) {
      console.error('Failed to delete shortage:', err);
    }
  };

  // Clean Completed Shortages
  const handleClearCompleted = async () => {
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.clearCompletedShortages();
        await loadData();
        setToastMessage({
          text: `تم تنظيف ${res.cleared} صنفاً متوفراً بالمخزن من كشكول النواقص`,
          type: 'success'
        });
      }
    } catch (err) {
      console.error('Failed to clear completed shortages:', err);
    }
  };

  // Save new manual shortage
  const handleSaveManualShortage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemToAdd) return;

    setSavingAdd(true);
    try {
      if (window.electronAPI) {
        await window.electronAPI.addOrUpdateShortage(
          selectedItemToAdd.item_id,
          addQuantity,
          addSupplierId !== '' ? Number(addSupplierId) : undefined
        );
        await loadData();
        setIsAddModalOpen(false);
        setSelectedItemToAdd(null);
        setItemSearchText('');
        setAddQuantity(1);
        setAddSupplierId('');
        setToastMessage({
          text: `تمت إضافة "${selectedItemToAdd.item_name_en}" إلى كشكول النواقص`,
          type: 'success'
        });
      }
    } catch (err) {
      console.error('Failed to save manual shortage:', err);
    } finally {
      setSavingAdd(false);
    }
  };

  // Convert selected to purchase invoice in F3
  const handleConvertToPurchases = () => {
    if (selectedShortageIds.size === 0) {
      setToastMessage({ text: 'يرجى تحديد صنف واحد على الأقل للطلب', type: 'error' });
      return;
    }

    const selectedItems = shortages
      .filter((s) => selectedShortageIds.has(s.shortage_id))
      .map((s) => ({
        item_id: s.item_id,
        item_name_en: s.item_name_en,
        item_name_ar: s.item_name_ar,
        quantity: s.quantity || 1,
        consumer_price: s.consumer_price || 0,
        buy_price: s.buy_price || 0,
        discount_pct: s.discount_pct || 0
      }));

    if (onTransferToPurchases) {
      onTransferToPurchases(selectedItems);
    }
  };

  // Calculations for selected items
  const selectedShortagesList = shortages.filter((s) =>
    selectedShortageIds.has(s.shortage_id)
  );
  const selectedEstimatedCost = selectedShortagesList.reduce(
    (acc, s) => acc + (s.quantity || 1) * (s.buy_price || 0),
    0
  );
  const zeroStockCount = shortages.filter((s) => s.current_stock <= 0).length;

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(shortages.length / (pageSize === -1 ? shortages.length || 1 : pageSize)));
  const paginatedShortages = pageSize === -1 
    ? shortages 
    : shortages.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const startItemIndex = shortages.length === 0 ? 0 : (currentPage - 1) * (pageSize === -1 ? shortages.length : pageSize) + 1;
  const endItemIndex = pageSize === -1 ? shortages.length : Math.min(currentPage * pageSize, shortages.length);

  // Selection toggle helpers
  const isAllCurrentPageSelected = paginatedShortages.length > 0 && paginatedShortages.every((s) => selectedShortageIds.has(s.shortage_id));
  const isAllTotalSelected = shortages.length > 0 && selectedShortageIds.size === shortages.length;

  const toggleSelectPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedShortageIds((prev) => {
        const next = new Set(prev);
        paginatedShortages.forEach((s) => next.delete(s.shortage_id));
        return next;
      });
    } else {
      setSelectedShortageIds((prev) => {
        const next = new Set(prev);
        paginatedShortages.forEach((s) => next.add(s.shortage_id));
        return next;
      });
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedShortageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllTotal = () => {
    setSelectedShortageIds(new Set(shortages.map((s) => s.shortage_id)));
  };

  const deselectAllTotal = () => {
    setSelectedShortageIds(new Set());
  };

  return (
    <div className="space-y-3 font-sans pb-8 select-none">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  كشكول النواقص الذكي والطلبيات
                </h1>
                <kbd className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-300">
                  F4
                </kbd>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                تتبع مسودات النواقص الـ 3,185 صنفاً، إدارة كميات الطلب وتوزيعها على الموردين، والتحويل المباشر لمشتريات.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* Clear Available */}
            <button
              onClick={handleClearCompleted}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="تنظيف النواقص التي أصبح رصيدها أكبر من صفر في المخزن"
            >
              <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>تنظيف المتوفر</span>
            </button>

            {/* Manual Add Button */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة صنف للنواقص</span>
            </button>

            {/* Convert to Purchases Button */}
            <button
              onClick={handleConvertToPurchases}
              disabled={selectedShortageIds.size === 0}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Truck className="w-4 h-4" />
              <span>
                تحويل المحددة ({selectedShortageIds.size}) إلى فاتورة مشتريات (F3)
              </span>
            </button>
          </div>
        </div>

        {/* 2. Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <span className="text-slate-500 block text-[11px]">إجمالي النواقص المسجلة:</span>
            <span className="font-mono font-extrabold text-sm text-slate-900">
              {shortages.length.toLocaleString('en-US')} صنف
            </span>
          </div>

          <div className="bg-rose-50/60 p-2.5 rounded-lg border border-rose-100">
            <span className="text-rose-700 block text-[11px]">الأصناف المنعدمة الرصيد (صفر):</span>
            <span className="font-mono font-extrabold text-sm text-rose-800">
              {zeroStockCount.toLocaleString('en-US')} صنف
            </span>
          </div>

          <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
            <span className="text-blue-700 block text-[11px]">المحددة للطلب حالياً:</span>
            <span className="font-mono font-extrabold text-sm text-blue-800">
              {selectedShortageIds.size} صنف
            </span>
          </div>

          <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
            <span className="text-emerald-700 block text-[11px]">التكلفة التقديرية للمحددة:</span>
            <span className="font-mono font-extrabold text-sm text-emerald-800">
              {selectedEstimatedCost.toFixed(2)} ج.م
            </span>
          </div>
        </div>

        {/* 3. Filters & Fast Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs font-bold text-slate-700">تصفية حسب المورد:</span>
            <select
              value={selectedSupplierId}
              onChange={(e) =>
                setSelectedSupplierId(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">جميع الموردين</option>
              {suppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث بالاسم أو المادة الفعالة في النواقص..."
              className="w-full pr-9 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
            />
          </div>
        </div>

        {/* Toast */}
        {toastMessage && (
          <div
            className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{toastMessage.text}</span>
            <button onClick={() => setToastMessage(null)} className="text-slate-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 4. Shortages Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-2.5 px-3 w-10 text-center">
                  <button
                    onClick={toggleSelectPage}
                    className="p-1 rounded hover:bg-slate-200/60 text-blue-600 cursor-pointer"
                    title={
                      isAllCurrentPageSelected
                        ? 'إلغاء تحديد أصناف الصفحة'
                        : 'تحديد جميع أصناف هذه الصفحة'
                    }
                  >
                    {isAllCurrentPageSelected ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3 min-w-[220px]">اسم الصنف</th>
                <th className="py-2.5 px-3 min-w-[140px]">المادة الفعالة والشركة</th>
                <th className="py-2.5 px-3 w-20 text-center">الرصيد</th>
                <th className="py-2.5 px-3 w-24 text-left">سعر الشراء</th>
                <th className="py-2.5 px-3 w-24 text-left">سعر الجمهور</th>
                <th className="py-2.5 px-3 w-32">المورد المقترح</th>
                <th className="py-2.5 px-3 w-28 text-center">الكمية المطلوبة</th>
                <th className="py-2.5 px-3 w-14 text-center">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
                    <span>جاري تحميل كشكول النواقص...</span>
                  </td>
                </tr>
              ) : shortages.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <ClipboardList className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-slate-600">لا توجد نواقص مطابقة</p>
                      <p className="text-xs text-slate-400">كشكول النواقص نظيف ومحدث بالكامل.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedShortages.map((shortage) => {
                  const isSelected = selectedShortageIds.has(shortage.shortage_id);
                  const isZero = shortage.current_stock <= 0;

                  return (
                    <tr
                      key={shortage.shortage_id}
                      className={`hover:bg-blue-50/30 transition-colors ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => toggleSelectOne(shortage.shortage_id)}
                          className="p-1 rounded hover:bg-slate-200/60 text-blue-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>

                      {/* Item Name */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">
                            {shortage.item_name_en}
                          </span>
                          {shortage.item_name_ar && (
                            <span className="text-[11px] text-slate-500 font-sans">
                              {shortage.item_name_ar}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Generic / Producer */}
                      <td className="py-2 px-3 text-slate-600 text-[11px]">
                        <span className="block truncate max-w-[150px]">
                          {shortage.generic_name || '-'}
                        </span>
                        {shortage.producer && (
                          <span className="text-[10px] text-slate-400 block">
                            {shortage.producer}
                          </span>
                        )}
                      </td>

                      {/* Current Stock */}
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono font-bold text-xs ${
                            isZero
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {shortage.current_stock}
                        </span>
                      </td>

                      {/* Buy Price */}
                      <td className="py-2 px-3 text-left font-mono text-slate-700">
                        {shortage.buy_price ? `${shortage.buy_price.toFixed(2)} ج.م` : '-'}
                      </td>

                      {/* Consumer Price */}
                      <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                        {shortage.consumer_price.toFixed(2)} ج.م
                      </td>

                      {/* Suggested Supplier */}
                      <td className="py-2 px-3 text-slate-700">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{shortage.supplier_name || 'غير محدد'}</span>
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() =>
                              handleUpdateQuantity(
                                shortage,
                                Math.max(1, (shortage.quantity || 1) - 1)
                              )
                            }
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={shortage.quantity || 1}
                            onChange={(e) =>
                              handleUpdateQuantity(
                                shortage,
                                Math.max(1, parseInt(e.target.value) || 1)
                              )
                            }
                            className="w-12 text-center font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded py-0.5 focus:bg-white focus:outline-none"
                          />
                          <button
                            onClick={() =>
                              handleUpdateQuantity(
                                shortage,
                                (shortage.quantity || 1) + 1
                              )
                            }
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Delete */}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => handleDeleteShortage(shortage.shortage_id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="حذف من النواقص"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Smart Selection Banner */}
        {isAllCurrentPageSelected && !isAllTotalSelected && shortages.length > paginatedShortages.length && (
          <div className="bg-blue-50 border-t border-b border-blue-200 px-4 py-2 text-center text-xs text-blue-800 flex items-center justify-center gap-2">
            <span>تم تحديد الـ {paginatedShortages.length} صنفاً المعروضة في هذه الصفحة.</span>
            <button
              onClick={selectAllTotal}
              className="font-bold underline hover:text-blue-900 transition-colors cursor-pointer"
            >
              تحديد جميع أصناف كشكول النواقص ({shortages.length.toLocaleString('en-US')} صنف)
            </button>
          </div>
        )}
        {isAllTotalSelected && shortages.length > pageSize && pageSize !== -1 && (
          <div className="bg-emerald-50 border-t border-b border-emerald-200 px-4 py-2 text-center text-xs text-emerald-800 flex items-center justify-center gap-2">
            <span>تم تحديد جميع الـ {shortages.length.toLocaleString('en-US')} صنفاً في كشكول النواقص بالكامل.</span>
            <button
              onClick={deselectAllTotal}
              className="font-bold underline hover:text-emerald-900 transition-colors cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>
        )}

        {/* Pagination Controls Bar */}
        {shortages.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-700">عرض:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={25}>25 صنف</option>
                <option value={50}>50 صنف (الأسرع)</option>
                <option value={100}>100 صنف</option>
                <option value={200}>200 صنف</option>
                <option value={-1}>الكل ({shortages.length.toLocaleString('en-US')})</option>
              </select>
              <span className="text-slate-500 font-mono">
                (الصفوف {startItemIndex.toLocaleString('en-US')} - {endItemIndex.toLocaleString('en-US')} من إجمالي {shortages.length.toLocaleString('en-US')})
              </span>
            </div>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1.5 select-none">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 transition-colors cursor-pointer"
                  title="الصفحة الأولى"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-medium text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>السابق</span>
                </button>

                <span className="px-3 py-1 font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg shadow-2xs">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-medium text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 transition-colors cursor-pointer"
                  title="الصفحة الأخيرة"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Add Shortage Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
          <form
            onSubmit={handleSaveManualShortage}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>إضافة صنف يدوياً إلى كشكول النواقص</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Search Drug */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  البحث عن الصنف في الكتالوج *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={itemSearchText}
                    onChange={(e) => setItemSearchText(e.target.value)}
                    placeholder="اكتب اسم الدواء بالإنجليزية أو العربية..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {searchingItem && (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>

                {/* Autocomplete list */}
                {searchResults.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-lg max-h-44 overflow-y-auto divide-y divide-slate-100 bg-white shadow-md">
                    {searchResults.map((item) => (
                      <div
                        key={item.item_id}
                        onClick={() => {
                          setSelectedItemToAdd(item);
                          setSearchResults([]);
                          setItemSearchText(item.item_name_en);
                        }}
                        className="p-2 hover:bg-blue-50 cursor-pointer flex justify-between items-center"
                      >
                        <div>
                          <strong className="text-slate-900 block">{item.item_name_en}</strong>
                          <span className="text-[11px] text-slate-500">
                            {item.item_name_ar || item.generic_name}
                          </span>
                        </div>
                        <span className="font-mono text-blue-700 font-bold">
                          {item.consumer_price.toFixed(2)} ج.م
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedItemToAdd && (
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 block text-[11px]">الصنف المختار:</span>
                    <strong className="text-slate-900">{selectedItemToAdd.item_name_en}</strong>
                  </div>
                  <span className="font-mono text-xs">
                    الرصيد: <strong>{selectedItemToAdd.current_stock}</strong>
                  </span>
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  الكمية المطلوب طلبها *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Supplier Dropdown */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  المورد المقترح (اختياري)
                </label>
                <select
                  value={addSupplierId}
                  onChange={(e) =>
                    setAddSupplierId(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-sans text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">بدون مورد محدد</option>
                  {suppliers.map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={!selectedItemToAdd || savingAdd}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                {savingAdd ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>إضافة للنواقص</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
