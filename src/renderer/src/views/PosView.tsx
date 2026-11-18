import React, { useState, useEffect, useCallback } from 'react';
import {
  Item,
  CreateSaleItemPayload,
  CreateSaleInvoicePayload,
  CreateSaleInvoiceResult,
  ReturnSaleInvoiceResult,
  AuthSession,
  EditableSaleInvoiceData,
  UpdateSaleInvoicePayload,
  DiscountMode,
  InsuranceProvider,
  DrugInteractionAlert,
  ChronicPatient
} from '../../../shared/types';
import { calculateInvoicePricing } from '../../../shared/pricing';
import { PosSearchInput } from '../components/pos/PosSearchInput';
import { PosCartTable } from '../components/pos/PosCartTable';
import { PosCheckoutPanel } from '../components/pos/PosCheckoutPanel';
import { ThermalReceiptModal } from '../components/pos/ThermalReceiptModal';
import { QuickReturnModal } from '../components/pos/QuickReturnModal';
import { DrugEyeSubstituteModal } from '../components/pos/DrugEyeSubstituteModal';
import { ChronicPatientsModal } from '../components/pos/ChronicPatientsModal';
import { ManagerOverrideModal } from '../components/auth/ManagerOverrideModal';
import { playBeepSuccess, playCheckoutChime, playWarningTone } from '../components/pos/soundEffects';
import { Plus, X, ShoppingBag, Receipt, AlertCircle, CheckCircle2, Pencil, HeartPulse, Shield } from 'lucide-react';

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
  discountMode: DiscountMode;
  discountInputValue: number;
  paymentMethod: 'نقدي' | 'فيزا' | 'محفظة / إنستاباي' | 'آجل' | 'دليفري';
  paidAmount: number;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  editingInvoiceNumber?: number;
  editingOverridePin?: string;
  insuranceProviderId?: number;
  insuranceCopayPct?: number;
  patientCardNumber?: string;
  chronicPatientId?: number;
}

function getActivePackPrice(item: CartItem): number {
  if (item.applied_price_source === 'TEMP_PRICE' && item.temp_price_active === 1 && Number(item.temp_price || 0) > 0) {
    return Number(item.temp_price);
  }
  return item.base_consumer_price;
}

const MAX_TABS = 5;

interface PosViewProps {
  currentUser?: AuthSession | null;
  pendingEditInvoice?: { data: EditableSaleInvoiceData; overridePin?: string } | null;
  onClearPendingEditInvoice?: () => void;
  pendingFinderItem?: { item: Item; unitType?: 'pack' | 'unit'; ts: number } | null;
  onClearPendingFinderItem?: () => void;
}

export const PosView: React.FC<PosViewProps> = ({
  currentUser,
  pendingEditInvoice,
  onClearPendingEditInvoice,
  pendingFinderItem,
  onClearPendingFinderItem
}) => {
  // 1. Multi-Tab Carts State
  const [tabs, setTabs] = useState<ActiveCartTab[]>([
    {
      id: 1,
      title: 'فاتورة 1',
      items: [],
      discount: 0,
      discountMode: 'AMOUNT',
      discountInputValue: 0,
      paymentMethod: 'نقدي',
      paidAmount: 0,
      clientName: '',
      clientPhone: '',
      clientAddress: ''
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<number>(1);
  const [nextTabNumber, setNextTabNumber] = useState<number>(2);
  const [pendingSaveOverride, setPendingSaveOverride] = useState<{ openPrint: boolean; actionLabel: string; details: string } | null>(null);

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

  const [showChronicModal, setShowChronicModal] = useState<boolean>(false);
  const [insuranceProviders, setInsuranceProviders] = useState<InsuranceProvider[]>([]);
  const [cartAlerts, setCartAlerts] = useState<DrugInteractionAlert[]>([]);

  // Current active cart reference
  const currentTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getInsuranceProviders().then(data => setInsuranceProviders(data || []));
    }
  }, []);

  useEffect(() => {
    if (currentTab.items.length >= 2 && window.electronAPI) {
      window.electronAPI.checkCartInteractions(currentTab.items).then(res => {
        setCartAlerts(res?.alerts || []);
      }).catch(err => {
        console.error('Check interactions error:', err);
        setCartAlerts([]);
      });
    } else {
      setCartAlerts([]);
    }
  }, [currentTab.items]);

  useEffect(() => {
    if (!pendingEditInvoice) return;
    const { data, overridePin } = pendingEditInvoice;
    const inv = data.invoice;
    const allowedMethods = ['نقدي', 'فيزا', 'محفظة / إنستاباي', 'آجل', 'دليفري'] as const;
    const pm = allowedMethods.includes(inv.payment_method as typeof allowedMethods[number])
      ? (inv.payment_method as ActiveCartTab['paymentMethod'])
      : 'نقدي';

    const editTabId = Date.now();
    const editTab: ActiveCartTab = {
      id: editTabId,
      title: `تعديل #${inv.invoice_number}`,
      items: data.items,
      discount: inv.discount || 0,
      discountMode: inv.discount_mode || 'AMOUNT',
      discountInputValue: inv.discount_input_value ?? inv.discount ?? 0,
      paymentMethod: pm,
      paidAmount: Math.max(0, (inv.total_selling_price || 0) - (inv.discount || 0)),
      clientName: inv.client_name || '',
      clientPhone: inv.client_phone || '',
      clientAddress: inv.client_address || '',
      editingInvoiceNumber: inv.invoice_number,
      editingOverridePin: overridePin
    };

    setTabs((prev) => {
      const existingIdx = prev.findIndex((t) => t.editingInvoiceNumber === inv.invoice_number);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...editTab, id: prev[existingIdx].id };
        setActiveTabId(prev[existingIdx].id);
        return next;
      }
      if (prev.length === 1 && prev[0].items.length === 0 && !prev[0].editingInvoiceNumber) {
        setActiveTabId(prev[0].id);
        return [{ ...editTab, id: prev[0].id }];
      }
      setActiveTabId(editTabId);
      return [...prev, editTab];
    });

    onClearPendingEditInvoice?.();
    showNotification(`تم تحميل الفاتورة #${inv.invoice_number} في وضع التعديل`, 'info');
  }, [pendingEditInvoice, onClearPendingEditInvoice]);

  useEffect(() => {
    if (!pendingFinderItem) return;
    void handleAddItem(pendingFinderItem.item, pendingFinderItem.unitType || 'pack');
    onClearPendingFinderItem?.();
  }, [pendingFinderItem, onClearPendingFinderItem]);

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
      discountMode: 'AMOUNT',
      discountInputValue: 0,
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
        discountMode: 'AMOUNT',
        discountInputValue: 0,
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
        applied_price_source: 'CONSUMER',
        temp_price: item.temp_price || 0,
        temp_price_active: item.temp_price_active || 0,
        current_stock: item.current_stock,
        base_consumer_price: item.consumer_price,
        base_buy_price: effectiveBuyPrice,
        has_pregnancy_warning: hasPregnancyWarning
      };

      return { ...tab, items: [newItem, ...tab.items] };
    }, targetTabId);
  };

  // Toggle between Consumer Price and Dual/Temp Price on a cart line
  const handleToggleTempPrice = (index: number) => {
    updateCurrentTab(tab => {
      const updated = [...tab.items];
      const item = updated[index];
      if (!item || item.temp_price_active !== 1 || !item.temp_price || item.temp_price <= 0) return tab;

      const nextSource: 'CONSUMER' | 'TEMP_PRICE' =
        item.applied_price_source === 'TEMP_PRICE' ? 'CONSUMER' : 'TEMP_PRICE';
      const nextPackPrice = nextSource === 'TEMP_PRICE' ? Number(item.temp_price) : item.base_consumer_price;
      const isStrip = item.unit_type === 'unit' && item.package_units > 1;
      const unitPrice = isStrip
        ? Math.round((nextPackPrice / item.package_units) * 100) / 100
        : nextPackPrice;
      const lineTotal = Math.round(item.quantity * unitPrice * (1 - (item.discount_pct || 0) / 100) * 100) / 100;

      updated[index] = {
        ...item,
        applied_price_source: nextSource,
        unit_price: unitPrice,
        line_total: lineTotal
      };
      return { ...tab, items: updated };
    });
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
      const activePackPrice = getActivePackPrice(item);
      const rawSubtotal = (item.unit_type === 'unit' && item.package_units > 1)
        ? (activePackPrice * validQty) / item.package_units
        : validQty * item.unit_price;
      const lineTotal = Math.round(rawSubtotal * (1 - (item.discount_pct || 0) / 100) * 100) / 100;
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
      const activePackPrice = getActivePackPrice(item);

      const unitPrice = isStrip
        ? Math.round((activePackPrice / item.package_units) * 100) / 100
        : activePackPrice;
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

  // Legacy Titan-style instant arrow adjustment on the most recently scanned item (items[0])
  const handleArrowAdjustLastItem = (delta: 1 | -1) => {
    updateCurrentTab(tab => {
      if (tab.items.length === 0) return tab;
      const updated = [...tab.items];
      const item = updated[0];
      const pkg = item.package_units > 1 ? Math.round(item.package_units) : 1;

      let newUnitType: 'pack' | 'unit' = item.unit_type;
      let newQty = item.quantity;

      if (pkg <= 1) {
        // Syrups / creams / single-unit items: step by 1 pack (min 1)
        newUnitType = 'pack';
        newQty = Math.max(1, Math.round((item.quantity + delta) * 100) / 100);
      } else if (item.unit_type === 'pack') {
        if (delta > 0) {
          newQty = Math.round((item.quantity + 1) * 100) / 100;
        } else if (item.quantity > 1) {
          newQty = Math.round((item.quantity - 1) * 100) / 100;
        } else {
          // Stepping down from 1 full box -> full strip count of the box (e.g. 1 box -> 3 strips)
          newUnitType = 'unit';
          newQty = pkg;
        }
      } else {
        // Currently selling by strip ('unit')
        const nextStrips = Math.round(item.quantity + delta);
        if (nextStrips > pkg) {
          // Stepping up past full box strip count -> snap cleanly back to 1 full pack
          newUnitType = 'pack';
          newQty = 1;
        } else {
          newUnitType = 'unit';
          newQty = Math.max(1, nextStrips);
        }
      }

      const isStrip = newUnitType === 'unit' && pkg > 1;
      const activePackPrice = getActivePackPrice(item);
      const unitPrice = isStrip
        ? Math.round((activePackPrice / pkg) * 100) / 100
        : activePackPrice;
      const costPrice = isStrip
        ? Math.round((item.base_buy_price / pkg) * 100) / 100
        : item.base_buy_price;
      const rawSubtotal = isStrip
        ? (activePackPrice * newQty) / pkg
        : newQty * unitPrice;
      const lineTotal = Math.round(rawSubtotal * (1 - (item.discount_pct || 0) / 100) * 100) / 100;

      updated[0] = {
        ...item,
        unit_type: newUnitType,
        quantity: newQty,
        unit_price: unitPrice,
        cost_price: costPrice,
        line_total: lineTotal
      };
      return { ...tab, items: updated };
    });
  };

  // Instant Left/Right toggle on last scanned item (1 عبوة <-> 1 شريط)
  const handleToggleLastItemUnit = () => {
    updateCurrentTab(tab => {
      if (tab.items.length === 0) return tab;
      const updated = [...tab.items];
      const item = updated[0];
      if (item.package_units <= 1) return tab;

      const newUnitType: 'pack' | 'unit' = item.unit_type === 'pack' ? 'unit' : 'pack';
      const isStrip = newUnitType === 'unit';
      const newQty = 1;
      const activePackPrice = getActivePackPrice(item);
      const unitPrice = isStrip
        ? Math.round((activePackPrice / item.package_units) * 100) / 100
        : activePackPrice;
      const costPrice = isStrip
        ? Math.round((item.base_buy_price / item.package_units) * 100) / 100
        : item.base_buy_price;
      const lineTotal = Math.round(newQty * unitPrice * (1 - (item.discount_pct || 0) / 100) * 100) / 100;

      updated[0] = {
        ...item,
        unit_type: newUnitType,
        quantity: newQty,
        unit_price: unitPrice,
        cost_price: costPrice,
        line_total: lineTotal
      };
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

  // Calculations via shared pricing engine
  const pricing = calculateInvoicePricing(
    currentTab.items,
    currentTab.discountMode,
    currentTab.discountInputValue
  );
  const subtotal = pricing.subtotal;
  const netTotal = pricing.netTotal;
  const paid = currentTab.paidAmount || netTotal;
  const changeAmount = Math.max(0, Math.round((paid - netTotal) * 100) / 100);

  // Save Sale Invoice (Atomic Execution with Manager Override Preflight)
  const executeSaveInvoice = async (
    openPrintModal: boolean = false,
    overrideAuth?: { pinCode: string; managerName: string }
  ) => {
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

    // Check role / below-cost guard before submitting when user is not ADMIN
    if (currentUser && currentUser.role !== 'ADMIN' && !overrideAuth) {
      if (pricing.isBelowCost || currentTab.discountMode === 'WHOLESALE_COST') {
        setPendingSaveOverride({
          openPrint: openPrintModal,
          actionLabel: 'البيع بسعر التكلفة أو أقل',
          details: `صافي الفاتورة (${netTotal.toFixed(2)} ج.م) يساوي أو يقل عن التكلفة (${pricing.totalCost.toFixed(2)} ج.م).`
        });
        playWarningTone();
        return;
      }
      const roleMaxPct = currentUser.max_discount_pct ?? (currentUser.role === 'CASHIER' ? 3 : 10);
      if (currentUser.role === 'CASHIER' && pricing.effectiveDiscountPct > roleMaxPct + 0.01) {
        setPendingSaveOverride({
          openPrint: openPrintModal,
          actionLabel: 'تجاوز حد خصم الكاشير',
          details: `نسبة الخصم (${pricing.effectiveDiscountPct}%) تتجاوز الحد المسموح (${roleMaxPct}%).`
        });
        playWarningTone();
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: CreateSaleInvoicePayload = {
        items: currentTab.items,
        discount: pricing.discountAmount,
        discount_mode: currentTab.discountMode,
        discount_input_value: currentTab.discountInputValue,
        payment_method: currentTab.paymentMethod,
        client_name: currentTab.clientName,
        client_phone: currentTab.clientPhone,
        client_address: currentTab.clientAddress,
        is_delivery: currentTab.paymentMethod === 'دليفري',
        paid_amount: paid,
        user_id: currentUser?.user_id,
        cashier_name: currentUser?.user_name,
        user_role: currentUser?.role,
        manager_override_pin: overrideAuth?.pinCode || currentTab.editingOverridePin,
        override_manager_name: overrideAuth?.managerName,
        insurance_provider_id: currentTab.insuranceProviderId,
        insurance_copay_pct: currentTab.insuranceCopayPct,
        patient_card_number: currentTab.patientCardNumber,
        chronic_patient_id: currentTab.chronicPatientId
      };

      if (window.electronAPI) {
        let result: CreateSaleInvoiceResult;
        if (currentTab.editingInvoiceNumber) {
          const updatePayload: UpdateSaleInvoicePayload = {
            ...payload,
            invoice_number: currentTab.editingInvoiceNumber,
            editor_user_id: currentUser?.user_id || 99,
            editor_user_name: currentUser?.user_name || 'مدير الصيدلية',
            editor_role: currentUser?.role || 'ADMIN',
            manager_override_pin: overrideAuth?.pinCode || currentTab.editingOverridePin
          };
          result = await window.electronAPI.updateSavedSaleInvoice(updatePayload);
        } else {
          result = await window.electronAPI.createSaleInvoice(payload);
        }

        if (result.success) {
          playCheckoutChime();
          showNotification(
            currentTab.editingInvoiceNumber
              ? `تم تعديل الفاتورة #${result.invoice_number} وحفظ المراجعة بنجاح!`
              : `تم حفظ الفاتورة #${result.invoice_number} بنجاح وتحديث الخزينة والرصيد!`,
            'success'
          );
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
              title: 'فاتورة 1',
              items: [],
              discount: 0,
              discountMode: 'AMOUNT',
              discountInputValue: 0,
              paidAmount: 0,
              clientName: '',
              clientPhone: '',
              clientAddress: '',
              editingInvoiceNumber: undefined,
              editingOverridePin: undefined
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

  const handleLoadPrescriptionToCart = (
    loadedItems: Array<{
      item_id: number;
      item_name: string;
      unit_price: number;
      quantity: number;
    }>,
    patient: ChronicPatient
  ) => {
    const newCartItems: CartItem[] = loadedItems.map((it) => ({
      item_id: it.item_id,
      item_name: it.item_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      line_total: Math.round(it.unit_price * it.quantity * 100) / 100,
      unit_type: 'pack',
      package_units: 1,
      discount_pct: 0,
      current_stock: 99,
      base_consumer_price: it.unit_price,
      base_buy_price: 0,
      cost_price: 0
    }));

    updateCurrentTab((tab) => ({
      ...tab,
      title: `روشتة ${patient.patient_name.slice(0, 10)}`,
      items: newCartItems,
      clientName: patient.patient_name,
      clientPhone: patient.phone || tab.clientPhone,
      chronicPatientId: patient.patient_id
    }));

    showNotification(`تم تحميل روشتة المريض ${patient.patient_name} بنجاح في الكاشير`, 'success');
  };

  // Keyboard Shortcuts Handler: F8 (Chronic Patients & Insurance), F9 (Save), F10 (Save & Print), F11 (Return), Alt+1..9 (Switch Tabs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['F8', 'F9', 'F10', 'F11'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'F8') {
        setShowChronicModal(true);
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
            const tabTotal = calculateInvoicePricing(tab.items, tab.discountMode, tab.discountInputValue).netTotal;

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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50 text-blue-700 text-xs font-bold transition-all shadow-2xs whitespace-nowrap shrink-0 group cursor-pointer"
              title="فتح فاتورة معلقة جديدة"
            >
              <div className="w-5 h-5 rounded-md bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Plus className="w-3.5 h-3.5 text-blue-700" />
              </div>
              <span className="whitespace-nowrap">فاتورة جديدة</span>
            </button>
          )}

          {/* M10: Chronic Patients & Insurance Modal Trigger (F8) */}
          <button
            type="button"
            onClick={() => setShowChronicModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-300 hover:border-rose-500 bg-rose-50/60 hover:bg-rose-50 text-rose-700 text-xs font-bold transition-all shadow-2xs whitespace-nowrap shrink-0 group cursor-pointer"
            title="ملفات المرضى المزمنين وتعاقدات التأمين الطبي (F8)"
          >
            <div className="w-5 h-5 rounded-md bg-rose-100 flex items-center justify-center group-hover:bg-rose-200 transition-colors">
              <HeartPulse className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <span className="whitespace-nowrap">المزمنين والتأمين</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-white border border-rose-200 text-[10px] font-mono font-bold text-rose-600 shadow-2xs">
              F8
            </kbd>
          </button>
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
            <span>مزمنين وتأمين</span>
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

      {/* Same-Day Invoice Editing Banner */}
      {currentTab.editingInvoiceNumber && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-2 flex items-center justify-between text-xs font-bold shadow-2xs">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              وضع تعديل الفاتورة رقم #{currentTab.editingInvoiceNumber} — الحفظ سيحدث نفس الرقم مع حفظ سجل المراجعة
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (tabs.length > 1) {
                const remaining = tabs.filter(t => t.id !== currentTab.id);
                setTabs(remaining);
                setActiveTabId(remaining[0].id);
              } else {
                updateCurrentTab(tab => ({
                  ...tab,
                  title: 'فاتورة 1',
                  items: [],
                  discount: 0,
                  discountMode: 'AMOUNT',
                  discountInputValue: 0,
                  paidAmount: 0,
                  clientName: '',
                  clientPhone: '',
                  clientAddress: '',
                  editingInvoiceNumber: undefined,
                  editingOverridePin: undefined
                }));
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 text-[11px] cursor-pointer"
          >
            إلغاء التعديل
          </button>
        </div>
      )}

      {/* 2. Smart Barcode & Search Input */}
      <div>
        <PosSearchInput
          onAddItem={handleAddItem}
          disabledGlobalCapture={showReceiptModal || showReturnModal || !!drugEyeTargetItem || !!pendingSaveOverride}
          hasCartItems={currentTab.items.length > 0}
          onArrowAdjust={handleArrowAdjustLastItem}
          onToggleLastUnit={handleToggleLastItemUnit}
          onDeleteLastItem={() => handleRemoveItem(0)}
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
        <div className="col-span-12 lg:col-span-8 h-full min-h-0 flex flex-col">
          {/* M10: Clinical Guard & DDI Alert Banner */}
          {cartAlerts.length > 0 && (
            <div className="mb-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-1.5 shadow-2xs shrink-0 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>تنبيهات سريرية وتعارضات دوائية في السلة ({cartAlerts.length})</span>
                </div>
                <span className="text-[10px] bg-amber-200/80 px-2 py-0.5 rounded font-mono font-bold text-amber-900">
                  Clinical Guard
                </span>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {cartAlerts.map((alt, i) => (
                  <div key={i} className="text-[11px] flex items-start gap-2 bg-white/80 p-1.5 rounded-lg border border-amber-200">
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                      alt.severity === 'HIGH' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {alt.type === 'DUPLICATE_GENERIC' ? 'تكرار نفس المادة الفعالة' : `تعارض ${alt.severity === 'HIGH' ? 'عالي' : 'متوسط'}`}
                    </span>
                    <div className="flex-1">
                      <span className="font-bold text-slate-900">{alt.itemA}</span> مع <span className="font-bold text-slate-900">{alt.itemB}</span>:
                      <span className="text-slate-600 mr-1">{alt.clinical_note}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0">
            <PosCartTable
              items={currentTab.items}
              onUpdateQuantity={handleUpdateQuantity}
              onToggleUnit={handleToggleUnit}
              onToggleTempPrice={handleToggleTempPrice}
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
        </div>

        {/* Right Column: Checkout & Payment Panel (col-span-4) */}
        <div className="col-span-12 lg:col-span-4 h-full min-h-0">
          <PosCheckoutPanel
            subtotal={subtotal}
            discount={pricing.discountAmount}
            discountMode={currentTab.discountMode}
            onChangeDiscountMode={mode =>
              updateCurrentTab(t => {
                const nextPricing = calculateInvoicePricing(t.items, mode, t.discountInputValue);
                return { ...t, discountMode: mode, discount: nextPricing.discountAmount };
              })
            }
            discountInputValue={currentTab.discountInputValue}
            onChangeDiscountInputValue={val =>
              updateCurrentTab(t => {
                const nextPricing = calculateInvoicePricing(t.items, t.discountMode, val);
                return { ...t, discountInputValue: val, discount: nextPricing.discountAmount };
              })
            }
            totalCost={pricing.totalCost}
            isBelowCost={pricing.isBelowCost}
            isAdmin={!currentUser || currentUser.role === 'ADMIN'}
            maxRecommendedDiscountPct={currentUser?.max_discount_pct || 15}
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
            insuranceProviders={insuranceProviders}
            selectedProviderId={currentTab.insuranceProviderId}
            onChangeSelectedProviderId={id => updateCurrentTab(t => ({ ...t, insuranceProviderId: id }))}
            insuranceCopayPct={currentTab.insuranceCopayPct}
            onChangeInsuranceCopayPct={pct => updateCurrentTab(t => ({ ...t, insuranceCopayPct: pct }))}
            patientCardNumber={currentTab.patientCardNumber}
            onChangePatientCardNumber={num => updateCurrentTab(t => ({ ...t, patientCardNumber: num }))}
            isSaving={isSaving}
            onSave={() => executeSaveInvoice(false)}
            onSaveAndPrint={() => executeSaveInvoice(true)}
            onOpenQuickReturn={() => setShowReturnModal(true)}
            hasItems={currentTab.items.length > 0}
          />
        </div>

      </div>

      {/* 4. Modals */}
      {/* M10: Chronic Patients & Insurance Modal (F8) */}
      <ChronicPatientsModal
        isOpen={showChronicModal}
        onClose={() => setShowChronicModal(false)}
        onLoadPrescriptionToCart={handleLoadPrescriptionToCart}
      />
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

      {/* M4: Manager Override Modal for below-cost or over-limit discount */}
      {currentUser && (
        <ManagerOverrideModal
          isOpen={!!pendingSaveOverride}
          currentUserId={currentUser.user_id}
          actionLabel={pendingSaveOverride?.actionLabel || 'تفويض بيع خاص'}
          details={pendingSaveOverride?.details}
          onClose={() => setPendingSaveOverride(null)}
          onAuthorized={({ pinCode, managerName }) => {
            const shouldPrint = pendingSaveOverride?.openPrint ?? false;
            setPendingSaveOverride(null);
            void executeSaveInvoice(shouldPrint, { pinCode, managerName });
          }}
        />
      )}

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
