import React, { useState, useEffect, useCallback } from 'react';
import { Item, CreateSaleItemPayload, CreateSaleInvoicePayload, CreateSaleInvoiceResult, ReturnSaleInvoiceResult } from '../../../shared/types';
import { PosSearchInput } from '../components/pos/PosSearchInput';
import { PosCartTable } from '../components/pos/PosCartTable';
import { PosCheckoutPanel } from '../components/pos/PosCheckoutPanel';
import { ThermalReceiptModal } from '../components/pos/ThermalReceiptModal';
import { QuickReturnModal } from '../components/pos/QuickReturnModal';
import { DrugEyeSubstituteModal } from '../components/pos/DrugEyeSubstituteModal';
import { playBeepSuccess, playCheckoutChime, playWarningTone } from '../components/pos/soundEffects';
import { Plus, X, ShoppingBag, Receipt, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CartItem extends CreateSaleItemPayload {
  current_stock: number;
  base_consumer_price: number;
  base_buy_price: number;
  has_pregnancy_warning?: boolean;
}

interface ActiveCartTab {
  id: number;
  title: string;
  items: CartItem[];
  discount: number;
  paymentMethod: 'نقدي' | 'فيزا' | 'محفظة / إنستاباي' | 'آجل' | 'دليفري';
  paidAmount: number;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
}

const MAX_TABS = 5;

export const PosView: React.FC = () => {
  // 1. Multi-Tab Carts State
  const [tabs, setTabs] = useState<ActiveCartTab[]>([
    {
      id: 1,
      title: 'فاتورة 1',
      items: [],
      discount: 0,
      paymentMethod: 'نقدي',
      paidAmount: 0,
      clientName: '',
      clientPhone: '',
      clientAddress: ''
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<number>(1);
  const [nextTabNumber, setNextTabNumber] = useState<number>(2);

  // Modals state
  const [completedInvoice, setCompletedInvoice] = useState<CreateSaleInvoiceResult | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [showReturnModal, setShowReturnModal] = useState<boolean>(false);
  const [drugEyeTargetItem, setDrugEyeTargetItem] = useState<{
    item_id: number;
    item_name: string;
    generic_name?: string;
    consumer_price: number;
    package_units?: number;
    indexToSwap?: number;
  } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Current active cart reference
  const currentTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const updateCurrentTab = (updater: (prev: ActiveCartTab) => ActiveCartTab, targetTabId?: number) => {
    const targetId = targetTabId ?? activeTabId;
    setTabs(prev => prev.map(tab => (tab.id === targetId ? updater(tab) : tab)));
  };

  // Add new cart tab (F8 or button)
  const handleAddNewTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      showNotification(`الحد الأقصى للفواتير المعلقة هو ${MAX_TABS} فواتير`, 'info');
      playWarningTone();
      return;
    }

    const newTabId = Date.now();
    const newTab: ActiveCartTab = {
      id: newTabId,
      title: `فاتورة ${nextTabNumber}`,
      items: [],
      discount: 0,
      paymentMethod: 'نقدي',
      paidAmount: 0,
      clientName: '',
      clientPhone: '',
      clientAddress: ''
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
    setNextTabNumber(prev => prev + 1);
    playBeepSuccess();

    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('focus-pos-search'));
    }, 50);
  }, [tabs.length, nextTabNumber]);

  // Close tab
  const handleCloseTab = (tabId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      // If only 1 tab, clear its items instead of closing
      updateCurrentTab(prev => ({
        ...prev,
        items: [],
        discount: 0,
        paidAmount: 0,
        clientName: '',
        clientPhone: '',
        clientAddress: ''
      }));
      return;
    }

    const targetTab = tabs.find(t => t.id === tabId);
    if (targetTab && targetTab.items.length > 0) {
      if (!window.confirm(`هل أنت متأكد من إغلاق ${targetTab.title}؟ ستفقد الأصناف الموجودة بها.`)) {
        return;
      }
    }

    const remaining = tabs.filter(t => t.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(remaining[0].id);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('focus-pos-search'));
      }, 50);
    }
  };

  // Add Item to Cart
  const handleAddItem = async (item: Item, unitType: 'pack' | 'unit' = 'pack') => {
    // Latch targetTabId immediately to guarantee item lands in the active tab at the moment of selection
    const targetTabId = activeTabId;

    // Check pregnancy warnings asynchronously
    let hasPregnancyWarning = false;
    try {
      if (window.electronAPI && item.generic_name) {
        const alerts = await window.electronAPI.getMedicalAlerts(item.generic_name, item.tax_schedule_category);
        hasPregnancyWarning = alerts.some(a => a.type === 'pregnancy');
      }
    } catch {
      // Ignore alert check failure
    }

    updateCurrentTab(tab => {
      const existingIdx = tab.items.findIndex(i => i.item_id === item.item_id && i.unit_type === unitType);

      if (existingIdx >= 0) {
        // Increment quantity
        const updated = [...tab.items];
        const current = updated[existingIdx];
        const newQty = current.quantity + 1;
        const lineTotal = Math.round(newQty * current.unit_price * (1 - (current.discount_pct || 0) / 100) * 100) / 100;
        updated[existingIdx] = {
          ...current,
          quantity: newQty,
          line_total: lineTotal
        };
        return { ...tab, items: updated };
      }

      // Compute initial prices with effective cost price formula
      const isStrip = unitType === 'unit' && item.package_units > 1;
      const unitPrice = isStrip
        ? Math.round((item.consumer_price / item.package_units) * 100) / 100
        : item.consumer_price;

      const itemDisc = (item.discount_pct && item.discount_pct > 0)
        ? item.discount_pct
        : ((item.pharmacy_discount_percent && item.pharmacy_discount_percent > 0) ? item.pharmacy_discount_percent : 25);

      const effectiveBuyPrice = (!item.buy_price || item.buy_price <= 0 || item.buy_price < item.consumer_price * 0.35)
        ? Math.round(item.consumer_price * (1.0 - itemDisc / 100.0) * 100) / 100
        : item.buy_price;

      const costPrice = isStrip
        ? Math.round((effectiveBuyPrice / item.package_units) * 100) / 100
        : effectiveBuyPrice;

      const newItem: CartItem = {
        item_id: item.item_id,
        item_name: item.item_name_en,
        item_name_ar: item.item_name_ar,
        generic_name: item.generic_name || undefined,
        quantity: 1,
        unit_type: unitType,
        package_units: item.package_units || 1,
        unit_price: unitPrice,
        cost_price: costPrice,
        discount_pct: 0,
        line_total: unitPrice,
        tax_schedule_category: item.tax_schedule_category,
        current_stock: item.current_stock,
        base_consumer_price: item.consumer_price,
        base_buy_price: effectiveBuyPrice,
        has_pregnancy_warning: hasPregnancyWarning
      };

      return { ...tab, items: [newItem, ...tab.items] };
    }, targetTabId);
  };

  // Update item quantity
  const handleUpdateQuantity = (index: number, newQty: number) => {
    updateCurrentTab(tab => {
      const updated = [...tab.items];
      if (newQty <= 0) {
        updated.splice(index, 1);
        return { ...tab, items: updated };
      }
      const item = updated[index];
      const validQty = Math.round(newQty * 100) / 100;
      const lineTotal = Math.round(validQty * item.unit_price * (1 - (item.discount_pct || 0) / 100) * 100) / 100;
      updated[index] = {
        ...item,
        quantity: validQty,
        line_total: lineTotal
      };
      return { ...tab, items: updated };
    });
  };

  // Toggle Unit (Pack vs Strip)
  const handleToggleUnit = (index: number) => {
    updateCurrentTab(tab => {
      const updated = [...tab.items];
      const item = updated[index];
      if (item.package_units <= 1) return tab;

      const newUnitType: 'pack' | 'unit' = item.unit_type === 'pack' ? 'unit' : 'pack';
      const isStrip = newUnitType === 'unit';

      const unitPrice = isStrip
        ? Math.round((item.base_consumer_price / item.package_units) * 100) / 100
        : item.base_consumer_price;
      const costPrice = isStrip
        ? Math.round((item.base_buy_price / item.package_units) * 100) / 100
        : item.base_buy_price;

      const lineTotal = Math.round(item.quantity * unitPrice * (1 - (item.discount_pct || 0) / 100) * 100) / 100;

      updated[index] = {
        ...item,
        unit_type: newUnitType,
        unit_price: unitPrice,
        cost_price: costPrice,
        line_total: lineTotal
      };

      return { ...tab, items: updated };
    });
  };

  // Update item discount %
  const handleUpdateDiscount = (index: number, newPct: number) => {
    updateCurrentTab(tab => {
      const updated = [...tab.items];
      const item = updated[index];
      const validPct = Math.max(0, Math.min(100, newPct));
      const lineTotal = Math.round(item.quantity * item.unit_price * (1 - validPct / 100) * 100) / 100;
      updated[index] = {
        ...item,
        discount_pct: validPct,
        line_total: lineTotal
      };
      return { ...tab, items: updated };
    });
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    updateCurrentTab(tab => {
      const updated = [...tab.items];
      updated.splice(index, 1);
      return { ...tab, items: updated };
    });
  };

  // Swap item from DrugEye substitutes
  const handleSelectSubstitute = (newItem: Item) => {
    if (drugEyeTargetItem?.indexToSwap !== undefined) {
      const idx = drugEyeTargetItem.indexToSwap;
      updateCurrentTab(tab => {
        const updated = [...tab.items];
        const oldItem = updated[idx];
        const unitPrice = oldItem.unit_type === 'unit' && newItem.package_units > 1
          ? Math.round((newItem.consumer_price / newItem.package_units) * 100) / 100
          : newItem.consumer_price;
        const itemDisc = (newItem.discount_pct && newItem.discount_pct > 0)
          ? newItem.discount_pct
          : ((newItem.pharmacy_discount_percent && newItem.pharmacy_discount_percent > 0) ? newItem.pharmacy_discount_percent : 25);

        const effectiveBuyPrice = (!newItem.buy_price || newItem.buy_price <= 0 || newItem.buy_price < newItem.consumer_price * 0.35)
          ? Math.round(newItem.consumer_price * (1.0 - itemDisc / 100.0) * 100) / 100
          : newItem.buy_price;

        const costPrice = oldItem.unit_type === 'unit' && newItem.package_units > 1
          ? Math.round((effectiveBuyPrice / newItem.package_units) * 100) / 100
          : effectiveBuyPrice;

        const itemDiscPct = oldItem.discount_pct || 0;
        const lineTotal = Math.round(oldItem.quantity * unitPrice * (1 - (itemDiscPct / 100)) * 100) / 100;

        updated[idx] = {
          ...oldItem,
          item_id: newItem.item_id,
          item_name: newItem.item_name_en,
          item_name_ar: newItem.item_name_ar,
          generic_name: newItem.generic_name || undefined,
          package_units: newItem.package_units || 1,
          unit_price: unitPrice,
          cost_price: costPrice,
          line_total: lineTotal,
          current_stock: newItem.current_stock,
          base_consumer_price: newItem.consumer_price,
          base_buy_price: effectiveBuyPrice
        };
        return { ...tab, items: updated };
      });
      showNotification(`تم استبدال الصنف بـ "${newItem.item_name_en}"`, 'success');
    } else {
      handleAddItem(newItem, 'pack');
    }
    setDrugEyeTargetItem(null);
  };

  // Calculations
  const subtotal = currentTab.items.reduce((acc, curr) => acc + curr.line_total, 0);
  const netTotal = Math.max(0, Math.round((subtotal - (currentTab.discount || 0)) * 100) / 100);
  const paid = currentTab.paidAmount || netTotal;
  const changeAmount = Math.max(0, Math.round((paid - netTotal) * 100) / 100);

  // Save Sale Invoice (Atomic Execution)
  const executeSaveInvoice = async (openPrintModal: boolean = false) => {
    if (currentTab.items.length === 0) {
      showNotification('لا يمكن حفظ فاتورة فارغة. يرجى إضافة أصناف.', 'error');
      playWarningTone();
      return;
    }

    if (currentTab.paymentMethod === 'آجل' && !currentTab.clientName.trim()) {
      showNotification('يرجى تحديد أو إدخال اسم العميل لحساب الآجل.', 'error');
      playWarningTone();
      return;
    }

    if (currentTab.paymentMethod === 'دليفري' && (!currentTab.clientPhone || !currentTab.clientAddress)) {
      showNotification('يرجى إدخال هاتف وعنوان العميل لطلب الدليفري.', 'error');
      playWarningTone();
      return;
    }

    setIsSaving(true);
    try {
      const payload: CreateSaleInvoicePayload = {
        items: currentTab.items,
        discount: currentTab.discount || 0,
        payment_method: currentTab.paymentMethod,
        client_name: currentTab.clientName,
        client_phone: currentTab.clientPhone,
        client_address: currentTab.clientAddress,
        is_delivery: currentTab.paymentMethod === 'دليفري',
        paid_amount: paid
      };

      if (window.electronAPI) {
        const result = await window.electronAPI.createSaleInvoice(payload);
        if (result.success) {
          playCheckoutChime();
          showNotification(`تم حفظ الفاتورة #${result.invoice_number} بنجاح وتحديث الخزينة والرصيد!`, 'success');
          window.dispatchEvent(new CustomEvent('refresh-app-stats'));

          if (openPrintModal) {
            setCompletedInvoice(result);
            setShowReceiptModal(true);
          }

          // Clear completed tab or close if multiple tabs
          if (tabs.length > 1) {
            const remaining = tabs.filter(t => t.id !== currentTab.id);
            setTabs(remaining);
            setActiveTabId(remaining[0].id);
          } else {
            updateCurrentTab(tab => ({
              ...tab,
              items: [],
              discount: 0,
              paidAmount: 0,
              clientName: '',
              clientPhone: '',
              clientAddress: ''
            }));
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`خطأ في حفظ الفاتورة: ${msg}`, 'error');
      playWarningTone();
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard Shortcuts Handler: F8 (New Tab), F9 (Save), F10 (Save & Print), F11 (Return), Alt+1..9 (Switch Tabs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['F8', 'F9', 'F10', 'F11'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'F8') {
        handleAddNewTab();
      } else if (e.key === 'F9') {
        executeSaveInvoice(false);
      } else if (e.key === 'F10') {
        executeSaveInvoice(true);
      } else if (e.key === 'F11') {
        setShowReturnModal(true);
      } else if (e.altKey && e.key >= '1' && e.key <= '9') {
        const tabIdx = parseInt(e.key, 10) - 1;
        if (tabIdx < tabs.length) {
          e.preventDefault();
          setActiveTabId(tabs[tabIdx].id);
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('focus-pos-search'));
          }, 50);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAddNewTab, executeSaveInvoice, tabs]);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col gap-2.5 font-sans select-none">
      
      {/* 1. Multi-Tab Active Carts Bar */}
      <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 no-scrollbar">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            const tabTotal = tab.items.reduce((acc, curr) => acc + curr.line_total, 0) - (tab.discount || 0);

            return (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('focus-pos-search'));
                  }, 50);
                }}
                className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-150 select-none whitespace-nowrap shrink-0 border ${
                  isActive
                    ? 'bg-gradient-to-b from-blue-50/70 to-white border-blue-500 text-blue-950 shadow-sm ring-2 ring-blue-500/15'
                    : 'bg-slate-50/90 hover:bg-slate-100 border-slate-200/80 text-slate-600 hover:text-slate-800'
                }`}
              >
                {/* Active Indicator Bar on top */}
                {isActive && (
                  <div className="absolute top-0 inset-x-3 h-0.5 bg-blue-600 rounded-full" />
                )}

                {/* Receipt Icon with badge style */}
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  isActive ? 'bg-blue-600 text-white shadow-2xs' : 'bg-slate-200/70 text-slate-500 group-hover:bg-slate-300/70'
                }`}>
                  <Receipt className="w-3.5 h-3.5" />
                </div>

                {/* Tab Title */}
                <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  <span className={`text-xs font-bold whitespace-nowrap ${isActive ? 'text-blue-950' : 'text-slate-700'}`}>
                    {tab.title}
                  </span>

                  {/* Items count badge */}
                  {tab.items.length > 0 && (
                    <span className={`inline-flex items-center justify-center h-4.5 px-1.5 rounded-md text-[10px] font-mono font-bold leading-none shrink-0 ${
                      isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {tab.items.length} {tab.items.length === 1 ? 'صنف' : 'أصناف'}
                    </span>
                  )}
                </div>

                {/* Subtotal preview with clean financial pill (Dir LTR to fix parenthesis flip) */}
                {tabTotal > 0 && (
                  <div
                    dir="ltr"
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold whitespace-nowrap shrink-0 border ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    <span>{tabTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[10px] font-sans font-medium text-emerald-800">ج.م</span>
                  </div>
                )}

                {/* Close tab cross */}
                <button
                  type="button"
                  onClick={e => handleCloseTab(tab.id, e)}
                  className="w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                  title="إغلاق الفاتورة"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {/* New Tab Button */}
          {tabs.length < MAX_TABS && (
            <button
              type="button"
              onClick={handleAddNewTab}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50 text-blue-700 text-xs font-bold transition-all shadow-2xs whitespace-nowrap shrink-0 group"
              title="فتح فاتورة معلقة جديدة (F8)"
            >
              <div className="w-5 h-5 rounded-md bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Plus className="w-3.5 h-3.5 text-blue-700" />
              </div>
              <span className="whitespace-nowrap">فاتورة جديدة</span>
              <kbd className="px-1.5 py-0.5 rounded-md bg-white border border-blue-200 text-[10px] font-mono font-bold text-blue-600 shadow-2xs">
                F8
              </kbd>
            </button>
          )}
        </div>

        {/* Quick shortcut helper tags */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-100 border border-slate-200 rounded text-slate-700">F2</kbd>
            <span>بحث</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-100 border border-slate-200 rounded text-slate-700">F8</kbd>
            <span>فاتورة معلقة</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-100 border border-slate-200 rounded text-slate-700">F9</kbd>
            <span>حفظ</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-100 border border-slate-200 rounded text-slate-700">F10</kbd>
            <span>طباعة</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-100 border border-slate-200 rounded text-slate-700">F11</kbd>
            <span>مرتجع</span>
          </span>
        </div>
      </div>

      {/* 2. Smart Barcode & Search Input */}
      <div>
        <PosSearchInput
          onAddItem={handleAddItem}
          onOpenDrugEye={item => {
            setDrugEyeTargetItem({
              item_id: item.item_id,
              item_name: item.item_name_en,
              generic_name: item.generic_name || undefined,
              consumer_price: item.consumer_price,
              package_units: item.package_units
            });
          }}
        />
      </div>

      {/* 3. Main Workspace: Cart Grid (Left) + Checkout Panel (Right) */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
        
        {/* Left Column: Interactive Cart Items Table (col-span-8) */}
        <div className="col-span-12 lg:col-span-8 h-full min-h-0">
          <PosCartTable
            items={currentTab.items}
            onUpdateQuantity={handleUpdateQuantity}
            onToggleUnit={handleToggleUnit}
            onUpdateDiscount={handleUpdateDiscount}
            onRemoveItem={handleRemoveItem}
            onOpenDrugEye={item => {
              const idx = currentTab.items.findIndex(i => i.item_id === item.item_id);
              setDrugEyeTargetItem({
                item_id: item.item_id,
                item_name: item.item_name,
                generic_name: item.generic_name,
                consumer_price: item.base_consumer_price,
                package_units: item.package_units,
                indexToSwap: idx >= 0 ? idx : undefined
              });
            }}
          />
        </div>

        {/* Right Column: Checkout & Payment Panel (col-span-4) */}
        <div className="col-span-12 lg:col-span-4 h-full min-h-0">
          <PosCheckoutPanel
            subtotal={subtotal}
            discount={currentTab.discount}
            onChangeDiscount={d => updateCurrentTab(t => ({ ...t, discount: d }))}
            netTotal={netTotal}
            paymentMethod={currentTab.paymentMethod}
            onChangePaymentMethod={m => updateCurrentTab(t => ({ ...t, paymentMethod: m }))}
            paidAmount={currentTab.paidAmount}
            onChangePaidAmount={p => updateCurrentTab(t => ({ ...t, paidAmount: p }))}
            changeAmount={changeAmount}
            clientName={currentTab.clientName}
            onChangeClientName={n => updateCurrentTab(t => ({ ...t, clientName: n }))}
            clientPhone={currentTab.clientPhone}
            onChangeClientPhone={p => updateCurrentTab(t => ({ ...t, clientPhone: p }))}
            clientAddress={currentTab.clientAddress}
            onChangeClientAddress={a => updateCurrentTab(t => ({ ...t, clientAddress: a }))}
            isSaving={isSaving}
            onSave={() => executeSaveInvoice(false)}
            onSaveAndPrint={() => executeSaveInvoice(true)}
            onOpenQuickReturn={() => setShowReturnModal(true)}
            hasItems={currentTab.items.length > 0}
          />
        </div>

      </div>

      {/* 4. Modals */}
      {/* 80mm Thermal Receipt Preview Modal */}
      {showReceiptModal && completedInvoice && (
        <ThermalReceiptModal
          invoice={completedInvoice}
          onClose={() => {
            setShowReceiptModal(false);
            setCompletedInvoice(null);
          }}
        />
      )}

      {/* F11 Quick Return Modal */}
      <QuickReturnModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        onSuccess={result => {
          showNotification(`تم استرجاع الفاتورة #${result.invoice_number} ورد ${result.total_refunded} ج.م بنجاح!`, 'success');
        }}
      />

      {/* DrugEye Alternatives Modal */}
      <DrugEyeSubstituteModal
        isOpen={!!drugEyeTargetItem}
        sourceItem={drugEyeTargetItem}
        onClose={() => setDrugEyeTargetItem(null)}
        onSelectSubstitute={handleSelectSubstitute}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className={`px-4 py-2.5 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : toast.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-white text-slate-800 border-slate-200 shadow-md'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
