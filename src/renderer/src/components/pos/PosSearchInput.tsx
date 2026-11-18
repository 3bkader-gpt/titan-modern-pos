import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Item } from '../../../../shared/types';
import { Search, Barcode, Sparkles, AlertTriangle, ShieldAlert } from 'lucide-react';
import { playBeepSuccess, playWarningTone } from './soundEffects';

interface PosSearchInputProps {
  onAddItem: (item: Item, unitType?: 'pack' | 'unit') => void;
  onOpenDrugEye: (item: Item) => void;
  disabledGlobalCapture?: boolean;
  hasCartItems?: boolean;
  onArrowAdjust?: (delta: 1 | -1) => void;
  onToggleLastUnit?: () => void;
  onDeleteLastItem?: () => void;
}

export const PosSearchInput: React.FC<PosSearchInputProps> = ({
  onAddItem,
  onOpenDrugEye,
  disabledGlobalCapture = false,
  hasCartItems = false,
  onArrowAdjust,
  onToggleLastUnit,
  onDeleteLastItem
}) => {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const latestValueRef = useRef<string>('');
  const lastSearchedQueryRef = useRef<string>('');

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      lastSearchedQueryRef.current = '';
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      if (window.electronAPI) {
        const items = await window.electronAPI.searchItems(trimmed, false, 30);
        // Ignore stale responses if the user already cleared/submitted the input
        if (latestValueRef.current.trim() !== trimmed) {
          return;
        }
        lastSearchedQueryRef.current = trimmed;
        setResults(items || []);
        setSelectedIndex(0);
        setIsOpen(true);
      }
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = useCallback((item: Item) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    latestValueRef.current = '';
    lastSearchedQueryRef.current = '';
    playBeepSuccess();
    onAddItem(item, 'pack');
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }, [onAddItem]);

  const submitDirectScan = useCallback((rawVal: string) => {
    const trimmed = rawVal.trim();
    if (!trimmed) return;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (window.electronAPI) {
      window.electronAPI.searchItems(trimmed, false, 1).then(found => {
        if (found && found.length > 0) {
          handleSelect(found[0]);
        } else {
          playWarningTone();
        }
      });
    }
  }, [handleSelect]);

  // Listen to F2 shortcut, focus-pos-search event, AND global USB barcode scanner auto-capture
  useEffect(() => {
    const handleRefocus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleRefocus();
        return;
      }

      if (disabledGlobalCapture) return;
      if (!inputRef.current || inputRef.current.offsetParent === null) return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl === inputRef.current) return;

      // Never steal keystrokes from another input/textarea/select or an open modal dialog
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], .fixed.inset-0')) {
        return;
      }

      // If Enter arrives right after a redirected scan burst, submit immediately
      if (e.key === 'Enter' && latestValueRef.current.trim()) {
        e.preventDefault();
        submitDirectScan(latestValueRef.current);
        return;
      }

      // Allow instant arrow adjustment on last scanned item even if focus slipped off the search bar
      if (!latestValueRef.current.trim() && hasCartItems) {
        if (e.key === 'ArrowUp' && onArrowAdjust) {
          e.preventDefault();
          onArrowAdjust(1);
          return;
        }
        if (e.key === 'ArrowDown' && onArrowAdjust) {
          e.preventDefault();
          onArrowAdjust(-1);
          return;
        }
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && onToggleLastUnit) {
          e.preventDefault();
          onToggleLastUnit();
          return;
        }
      }

      // Redirect first printable barcode/search keystroke directly into POS search bar without losing a single character
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const nextVal = latestValueRef.current + e.key;
        latestValueRef.current = nextVal;
        setQuery(nextVal);
        inputRef.current?.focus();

        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
          performSearch(nextVal);
        }, 120);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    window.addEventListener('focus-pos-search', handleRefocus);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      window.removeEventListener('focus-pos-search', handleRefocus);
    };
  }, [disabledGlobalCapture, hasCartItems, onArrowAdjust, onToggleLastUnit, performSearch, submitDirectScan]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    latestValueRef.current = val;
    setQuery(val);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!val.trim()) {
      lastSearchedQueryRef.current = '';
      setResults([]);
      setIsOpen(false);
      return;
    }

    // Faster debounce (120ms) for high-speed responsiveness
    debounceTimer.current = setTimeout(() => {
      performSearch(val);
    }, 120);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 1. Enter key: Barcode instant submit or dropdown selection
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      const currentVal = (e.currentTarget.value || latestValueRef.current).trim();
      if (
        isOpen &&
        results.length > 0 &&
        selectedIndex >= 0 &&
        selectedIndex < results.length &&
        lastSearchedQueryRef.current === currentVal
      ) {
        handleSelect(results[selectedIndex]);
      } else if (currentVal) {
        submitDirectScan(currentVal);
      }
      return;
    }

    // 2. Arrow Navigation (Dropdown when open; Instant Strip/Pack adjust on last scanned item when search is empty)
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!query.trim() && !isOpen && hasCartItems && onArrowAdjust) {
        onArrowAdjust(-1);
        return;
      }
      if (!isOpen && results.length > 0) {
        setIsOpen(true);
      } else if (results.length > 0) {
        setSelectedIndex(prev => (prev + 1 < results.length ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!query.trim() && !isOpen && hasCartItems && onArrowAdjust) {
        onArrowAdjust(1);
        return;
      }
      if (results.length > 0) {
        setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : results.length - 1));
      }
      return;
    }

    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !query.trim() && !isOpen && hasCartItems && onToggleLastUnit) {
      e.preventDefault();
      onToggleLastUnit();
      return;
    }

    if (e.key === 'Delete' && !query.trim() && !isOpen && hasCartItems && onDeleteLastItem) {
      e.preventDefault();
      onDeleteLastItem();
      return;
    }

    // 3. Alt+A to open DrugEye for highlighted item
    if (e.altKey && (e.key === 'a' || e.key === 'A' || e.key === 'ش')) {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        onOpenDrugEye(results[selectedIndex]);
      }
      return;
    }

    // 4. Escape to close dropdown
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="relative w-full font-sans">
      <div className="relative flex items-center">
        {/* Barcode scanner / search icon */}
        <div className="absolute right-3.5 flex items-center gap-1.5 text-slate-400 pointer-events-none">
          <Barcode className="w-5 h-5 text-blue-600" />
        </div>

        <input
          id="pos-barcode-search-input"
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="مسح الباركود أو اسم الصنف / .=نهاية / *نجوم / =صوتي... (F2 للتركيز | Ctrl+F للبحث المتقدم)"
          className="w-full pl-56 pr-12 py-3 rounded-xl bg-white border-2 border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100/70 text-sm font-semibold text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 placeholder:font-normal"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Shortcut badges & Advanced Search trigger right inside input */}
        <div className="absolute left-2.5 flex items-center gap-1.5">
          {loading ? (
            <span className="text-xs text-blue-600 font-medium animate-pulse">جاري البحث...</span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('titan-open-advanced-finder'))}
                className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="محرك البحث المتقدم بـ 9 طرق (Ctrl+F)"
              >
                <Search className="w-3 h-3" />
                بحث متقدم (Ctrl+F)
              </button>
              <kbd className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-slate-100 border border-slate-200 text-slate-600">
                F2
              </kbd>
              <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-slate-100 border border-slate-200 text-slate-600">
                Alt+A
              </kbd>
            </>
          )}
        </div>
      </div>

      {/* Instant Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-40 left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 max-h-96 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-100"
        >
          {results.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            const inStock = item.current_stock > 0;
            const isSchedule = item.tax_schedule_category === 1 || item.tax_schedule_category === 2;

            return (
              <div
                key={item.item_id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  isSelected ? 'bg-blue-50/90 text-blue-950' : 'hover:bg-slate-50'
                }`}
              >
                {/* Item Titles */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 truncate">
                      {item.item_name_en}
                    </span>

                    {/* Stock badge */}
                    {inStock ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        متاح: {item.current_stock}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                        رصيد 0
                      </span>
                    )}

                    {/* Schedule Badge */}
                    {isSchedule && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5">
                        <ShieldAlert className="w-3 h-3" />
                        <span>جدول {item.tax_schedule_category === 1 ? 'أول' : 'ثانٍ'}</span>
                      </span>
                    )}
                  </div>

                  {/* Arabic name + Generic Name */}
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

                {/* Units & Pricing */}
                <div className="flex items-center gap-3 shrink-0">
                  {item.package_units > 1 && (
                    <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.5 rounded bg-slate-100">
                      {item.package_units} شرائط
                    </span>
                  )}

                  <div className="text-left font-mono">
                    <span className="text-xs font-bold text-slate-900 block">
                      {item.consumer_price.toFixed(2)} ج.م
                    </span>
                    {item.package_units > 1 && (
                      <span className="text-[10px] text-slate-500 block">
                        {(item.consumer_price / item.package_units).toFixed(2)} للشريط
                      </span>
                    )}
                  </div>

                  {/* DrugEye Alt Button */}
                  <button
                    type="button"
                    title="عرض البدائل الدوائية (Alt+A)"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDrugEye(item);
                    }}
                    className="p-1 rounded-md hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
