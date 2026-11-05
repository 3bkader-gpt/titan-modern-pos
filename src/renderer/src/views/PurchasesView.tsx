import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Supplier, 
  PurchaseInvoice, 
  PurchaseInvoiceItem, 
  Item, 
  CreatePurchaseInvoicePayload 
} from '../../../shared/types';
import { 
  Truck, 
  Plus, 
  Search, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  FileText, 
  DollarSign, 
  ArrowRight, 
  Building2, 
  Phone, 
  Clock, 
  Eye, 
  X, 
  RefreshCw,
  Sparkles,
  HelpCircle,
  Save,
  Check
} from 'lucide-react';

interface PurchasesViewProps {
  initialDraftItems?: Array<{
    item_id: number;
    item_name_en: string;
    item_name_ar?: string;
    quantity: number;
    consumer_price: number;
    buy_price: number;
    discount_pct?: number;
    expiry_date?: string;
  }>;
  onClearInitialDraft?: () => void;
}

interface PurchaseDraftLine {
  item_id: number;
  item_name_en: string;
  item_name_ar?: string;
  original_consumer_price: number;
  consumer_price: number;
  discount_pct: number;
  buy_price: number;
  quantity: number;
  bonus_quantity: number;
  expiry_date: string;
  line_total: number;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  initialDraftItems,
  onClearInitialDraft
}) => {
  // Navigation Tabs inside Purchases view
  const [activeTab, setActiveTab] = useState<'new_invoice' | 'history' | 'suppliers'>('new_invoice');

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState<boolean>(false);

  // New Invoice Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  const [paperInvoiceNumber, setPaperInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CREDIT'>('CREDIT');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [draftLines, setDraftLines] = useState<PurchaseDraftLine[]>([]);

  // Item Search in New Invoice
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // History state
  const [invoicesHistory, setInvoicesHistory] = useState<PurchaseInvoice[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [selectedInvoiceDetails, setSelectedInvoiceDetails] = useState<{
    invoice: PurchaseInvoice;
    items: PurchaseInvoiceItem[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Add Supplier Modal state
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState<boolean>(false);
  const [newSupplierName, setNewSupplierName] = useState<string>('');
  const [newSupplierPhone, setNewSupplierPhone] = useState<string>('');
  const [newSupplierAddress, setNewSupplierAddress] = useState<string>('');
  const [savingSupplier, setSavingSupplier] = useState<boolean>(false);

  // Success / Error banner
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [submittingInvoice, setSubmittingInvoice] = useState<boolean>(false);

  // 1. Fetch Suppliers
  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getSuppliers();
        setSuppliers(data || []);
        if (data && data.length > 0 && selectedSupplierId === '') {
          // Select first supplier by default (often المتحدة or ابن سينا)
          setSelectedSupplierId(data[0].supplier_id);
        }
      }
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setLoadingSuppliers(false);
    }
  }, [selectedSupplierId]);

  // 2. Fetch History
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getPurchaseInvoices(100);
        setInvoicesHistory(data || []);
      }
    } catch (err) {
      console.error('Failed to load purchase invoices history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // 3. Handle Initial Draft from Shortages
  useEffect(() => {
    if (initialDraftItems && initialDraftItems.length > 0) {
      const convertedLines: PurchaseDraftLine[] = initialDraftItems.map((item) => {
        const consumer = item.consumer_price || 0;
        const buy = item.buy_price || 0;
        let discount = item.discount_pct || 0;
        if (discount === 0 && consumer > 0 && buy > 0) {
          discount = Number((((consumer - buy) / consumer) * 100).toFixed(1));
        }
        return {
          item_id: item.item_id,
          item_name_en: item.item_name_en,
          item_name_ar: item.item_name_ar,
          original_consumer_price: consumer,
          consumer_price: consumer,
          discount_pct: discount,
          buy_price: buy,
          quantity: item.quantity || 1,
          bonus_quantity: 0,
          expiry_date: item.expiry_date || '',
          line_total: (item.quantity || 1) * buy
        };
      });

      setDraftLines(convertedLines);
      setActiveTab('new_invoice');
      setStatusMessage({
        text: `تم استيراد ${convertedLines.length} صنفاً من كشكول النواقص بنجاح. يرجى اختيار المورد وتأكيد الفاتورة.`,
        type: 'success'
      });

      if (onClearInitialDraft) {
        onClearInitialDraft();
      }
    }
  }, [initialDraftItems, onClearInitialDraft]);

  // 4. Item Search Debounce
  useEffect(() => {
    if (!itemSearchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        if (window.electronAPI) {
          const res = await window.electronAPI.searchItems(itemSearchQuery.trim(), 12);
          setSearchResults(res || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Error searching items for purchase:', err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [itemSearchQuery]);

  // Add Item to Draft
  const handleSelectItem = (item: Item) => {
    // Check if already in draft
    const existingIndex = draftLines.findIndex((line) => line.item_id === item.item_id);
    if (existingIndex >= 0) {
      // Increase quantity
      setDraftLines((prev) => {
        const updated = [...prev];
        const line = updated[existingIndex];
        const newQty = line.quantity + 1;
        updated[existingIndex] = {
          ...line,
          quantity: newQty,
          line_total: newQty * line.buy_price
        };
        return updated;
      });
    } else {
      const consumer = item.consumer_price || 0;
      const buy = item.buy_price || Number((consumer * 0.75).toFixed(2));
      let discount = item.discount_pct || 0;
      if (discount === 0 && consumer > 0 && buy > 0) {
        discount = Number((((consumer - buy) / consumer) * 100).toFixed(1));
      }

      const newLine: PurchaseDraftLine = {
        item_id: item.item_id,
        item_name_en: item.item_name_en,
        item_name_ar: item.item_name_ar,
        original_consumer_price: consumer,
        consumer_price: consumer,
        discount_pct: discount,
        buy_price: buy,
        quantity: 1,
        bonus_quantity: 0,
        expiry_date: item.expiry_date || '',
        line_total: buy
      };
      setDraftLines((prev) => [newLine, ...prev]);
    }

    setItemSearchQuery('');
    setShowDropdown(false);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Line field changes
  const updateLine = (index: number, changes: Partial<PurchaseDraftLine>) => {
    setDraftLines((prev) => {
      const updated = [...prev];
      const cur = { ...updated[index], ...changes };

      // Recalculate buy price if discount changes
      if ('discount_pct' in changes || 'consumer_price' in changes) {
        const consumer = cur.consumer_price || 0;
        const discount = cur.discount_pct || 0;
        cur.buy_price = Number((consumer * (1 - discount / 100)).toFixed(2));
      } else if ('buy_price' in changes) {
        const consumer = cur.consumer_price || 0;
        const buy = cur.buy_price || 0;
        if (consumer > 0) {
          cur.discount_pct = Number((((consumer - buy) / consumer) * 100).toFixed(1));
        }
      }

      cur.line_total = Number(((cur.quantity || 0) * (cur.buy_price || 0)).toFixed(2));
      updated[index] = cur;
      return updated;
    });
  };

  const removeLine = (index: number) => {
    setDraftLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const totalItemsCount = draftLines.length;
  const totalPiecesCount = draftLines.reduce(
    (acc, line) => acc + (line.quantity || 0) + (line.bonus_quantity || 0),
    0
  );
  const totalConsumerAmount = draftLines.reduce(
    (acc, line) =>
      acc +
      ((line.quantity || 0) + (line.bonus_quantity || 0)) * (line.consumer_price || 0),
    0
  );
  const totalNetCost = draftLines.reduce(
    (acc, line) => acc + (line.line_total || 0),
    0
  );
  const totalProfitMargin = totalConsumerAmount - totalNetCost;

  // Submit Purchase Invoice
  const handleSubmitInvoice = async () => {
    if (!selectedSupplierId) {
      setStatusMessage({ text: 'يرجى اختيار المورد أولاً', type: 'error' });
      return;
    }
    if (draftLines.length === 0) {
      setStatusMessage({ text: 'يرجى إضافة صنف واحد على الأقل للفاتورة', type: 'error' });
      return;
    }

    setSubmittingInvoice(true);
    setStatusMessage(null);

    try {
      const payload: CreatePurchaseInvoicePayload = {
        supplier_id: Number(selectedSupplierId),
        paper_invoice_number: paperInvoiceNumber.trim() || undefined,
        invoice_date: invoiceDate,
        payment_method: paymentMethod,
        notes: invoiceNotes.trim() || undefined,
        items: draftLines.map((line) => ({
          item_id: line.item_id,
          quantity: line.quantity,
          bonus_quantity: line.bonus_quantity || 0,
          consumer_price: line.consumer_price,
          buy_price: line.buy_price,
          discount_pct: line.discount_pct || 0,
          expiry_date: line.expiry_date.trim() || undefined
        }))
      };

      if (window.electronAPI) {
        const res = await window.electronAPI.createPurchaseInvoice(payload);
        setStatusMessage({
          text: `تم استلام الفاتورة رقم #${res.invoice_id} بنجاح! تم تحديث رصيد ${res.items_updated} صنفاً، وتنظيف النواقص الموردة، وتسجيل القيد المالي (${res.total_amount.toFixed(2)} ج.م).`,
          type: 'success'
        });

        // Reset form
        setDraftLines([]);
        setPaperInvoiceNumber('');
        setInvoiceNotes('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ text: `فشل توريد الفاتورة: ${msg}`, type: 'error' });
    } finally {
      setSubmittingInvoice(false);
    }
  };

  // View Invoice Details
  const handleViewInvoiceDetails = async (invoice: PurchaseInvoice) => {
    setLoadingDetails(true);
    try {
      if (window.electronAPI) {
        const items = await window.electronAPI.getPurchaseInvoiceItems(invoice.invoice_id);
        setSelectedInvoiceDetails({ invoice, items: items || [] });
      }
    } catch (err) {
      console.error('Error fetching invoice items:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Add New Supplier
  const handleSaveNewSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;

    setSavingSupplier(true);
    try {
      if (window.electronAPI) {
        const saved = await window.electronAPI.saveSupplier({
          supplier_name: newSupplierName.trim(),
          phone: newSupplierPhone.trim() || undefined,
          address: newSupplierAddress.trim() || undefined
        });

        await loadSuppliers();
        setSelectedSupplierId(saved.supplier_id);
        setIsAddSupplierOpen(false);
        setNewSupplierName('');
        setNewSupplierPhone('');
        setNewSupplierAddress('');
        setStatusMessage({
          text: `تمت إضافة المورد "${saved.supplier_name}" بنجاح`,
          type: 'success'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`خطأ في إضافة المورد: ${msg}`);
    } finally {
      setSavingSupplier(false);
    }
  };

  return (
    <div className="space-y-3 font-sans pb-8 select-none">
      {/* 1. Top Navigation & Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  فواتير المشتريات والتوريد والموردين
                </h1>
                <kbd className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-300">
                  F3
                </kbd>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                استلام بضائع الموردين الـ 17، زيادة أرصدة المخزن تلقائياً، تتبع البونص، وتحديث الأسعار والصلاحيات.
              </p>
            </div>
          </div>

          {/* Sub-Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setActiveTab('new_invoice')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'new_invoice'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>فاتورة توريد جديدة</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>سجل الفواتير (311+)</span>
            </button>

            <button
              onClick={() => setActiveTab('suppliers')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'suppliers'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>دليل الموردين ({suppliers.length})</span>
            </button>
          </div>
        </div>

        {/* Status Toast Banner */}
        {statusMessage && (
          <div
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-all ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* TAB 1: NEW PURCHASE INVOICE                               */}
      {/* ======================================================== */}
      {activeTab === 'new_invoice' && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
          {/* Main Receiving Table & Item Picker (3 Cols) */}
          <div className="xl:col-span-3 space-y-3">
            {/* Header Form: Supplier, Paper No, Date, Payment */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Supplier Dropdown */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">المورد / شركة التوزيع</label>
                    <button
                      onClick={() => setIsAddSupplierOpen(true)}
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>إضافة</span>
                    </button>
                  </div>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {suppliers.map((s) => (
                      <option key={s.supplier_id} value={s.supplier_id}>
                        {s.supplier_name} {s.phone ? `(${s.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Paper Invoice Number */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    رقم الفاتورة الورقية
                  </label>
                  <input
                    type="text"
                    value={paperInvoiceNumber}
                    onChange={(e) => setPaperInvoiceNumber(e.target.value)}
                    placeholder="مثال: INV-98432"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Invoice Date */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تاريخ الفاتورة
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">طريقة الدفع</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CREDIT')}
                      className={`py-1.5 rounded-lg font-bold border transition-all text-center ${
                        paymentMethod === 'CREDIT'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      آجل (حساب مورد)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`py-1.5 rounded-lg font-bold border transition-all text-center ${
                        paymentMethod === 'CASH'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      نقدي (الخزينة)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Fast Item Search Input */}
            <div className="relative">
              <div className="bg-white rounded-xl border border-slate-200/90 p-2.5 shadow-2xs flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0 mr-1" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  placeholder="ابحث بالاسم التجاري أو الباركود لإضافة الصنف إلى الفاتورة..."
                  className="w-full bg-transparent text-xs font-sans text-slate-800 placeholder-slate-400 focus:outline-none"
                />
                {searching && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                {itemSearchQuery && (
                  <button
                    onClick={() => {
                      setItemSearchQuery('');
                      setShowDropdown(false);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-30 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-100">
                  {searchResults.map((item) => (
                    <div
                      key={item.item_id}
                      onClick={() => handleSelectItem(item)}
                      className="p-2.5 hover:bg-blue-50/70 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{item.item_name_en}</span>
                        <span className="text-[11px] text-slate-500 font-sans">
                          {item.item_name_ar || item.generic_name || 'بدون تفاصيل'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 font-mono text-[11px]">
                        <span className="text-slate-500">
                          الرصيد: <strong className="text-slate-700">{item.current_stock}</strong>
                        </span>
                        <span className="text-blue-700 font-bold">
                          {item.consumer_price.toFixed(2)} ج.م
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Receiving Items Table */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                <span className="text-xs font-bold text-slate-800">
                  الأصناف الموردة بالفاتورة ({draftLines.length})
                </span>
                {draftLines.length > 0 && (
                  <button
                    onClick={() => setDraftLines([])}
                    className="text-[11px] text-rose-600 hover:underline"
                  >
                    تفريغ الأصناف
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3 min-w-[200px]">اسم الصنف</th>
                      <th className="py-2.5 px-2 w-20 text-center">الكمية</th>
                      <th className="py-2.5 px-2 w-20 text-center">بونص</th>
                      <th className="py-2.5 px-2 w-24 text-center">سعر الجمهور</th>
                      <th className="py-2.5 px-2 w-20 text-center">خصم %</th>
                      <th className="py-2.5 px-2 w-24 text-center">سعر التكلفة</th>
                      <th className="py-2.5 px-2 w-24 text-center">الصلاحية</th>
                      <th className="py-2.5 px-3 w-28 text-left">الإجمالي</th>
                      <th className="py-2.5 px-2 w-10 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draftLines.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <Truck className="w-8 h-8 text-slate-300" />
                            <p className="font-semibold text-slate-600">الفاتورة فارغة حالياً</p>
                            <p className="text-xs text-slate-400">
                              ابحث عن صنف أعلاه لإضافته، أو حول طلبيات النواقص من شاشة (F4).
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      draftLines.map((line, idx) => {
                        const priceChanged =
                          line.consumer_price !== line.original_consumer_price;

                        return (
                          <tr key={`${line.item_id}-${idx}`} className="hover:bg-slate-50/60">
                            {/* Item Name */}
                            <td className="py-2 px-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900">
                                  {line.item_name_en}
                                </span>
                                {line.item_name_ar && (
                                  <span className="text-[11px] text-slate-500 font-sans">
                                    {line.item_name_ar}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Quantity */}
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })
                                }
                                className="w-16 px-1.5 py-1 text-center font-mono font-bold bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            {/* Bonus Quantity */}
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min={0}
                                value={line.bonus_quantity}
                                onChange={(e) =>
                                  updateLine(idx, {
                                    bonus_quantity: Math.max(0, parseInt(e.target.value) || 0)
                                  })
                                }
                                className="w-14 px-1.5 py-1 text-center font-mono text-emerald-700 font-bold bg-emerald-50/50 border border-emerald-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                placeholder="0"
                              />
                            </td>

                            {/* Consumer Price with price change alert */}
                            <td className="py-2 px-2 text-center">
                              <div className="flex flex-col items-center">
                                <input
                                  type="number"
                                  step="0.25"
                                  value={line.consumer_price}
                                  onChange={(e) =>
                                    updateLine(idx, {
                                      consumer_price: parseFloat(e.target.value) || 0
                                    })
                                  }
                                  className={`w-20 px-1.5 py-1 text-center font-mono font-bold border rounded focus:outline-none focus:ring-1 ${
                                    priceChanged
                                      ? 'bg-amber-50 border-amber-300 text-amber-800 focus:ring-amber-500'
                                      : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-500'
                                  }`}
                                />
                                {priceChanged && (
                                  <span className="text-[10px] text-amber-700 font-bold mt-0.5" title={`السعر القديم: ${line.original_consumer_price}`}>
                                    تغير سعر ⚡
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Discount % */}
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                step="0.5"
                                value={line.discount_pct}
                                onChange={(e) =>
                                  updateLine(idx, {
                                    discount_pct: parseFloat(e.target.value) || 0
                                  })
                                }
                                className="w-14 px-1.5 py-1 text-center font-mono bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            {/* Buy Price */}
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                step="0.25"
                                value={line.buy_price}
                                onChange={(e) =>
                                  updateLine(idx, {
                                    buy_price: parseFloat(e.target.value) || 0
                                  })
                                }
                                className="w-20 px-1.5 py-1 text-center font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            {/* Expiry Date */}
                            <td className="py-2 px-2 text-center">
                              <input
                                type="text"
                                placeholder="MM-YYYY"
                                value={line.expiry_date}
                                onChange={(e) => updateLine(idx, { expiry_date: e.target.value })}
                                className="w-20 px-1.5 py-1 text-center font-mono text-[11px] bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            {/* Line Total */}
                            <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                              {line.line_total.toFixed(2)} ج.م
                            </td>

                            {/* Delete */}
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => removeLine(idx)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
            </div>
          </div>

          {/* Right Summary Column (1 Col) */}
          <div className="space-y-3">
            {/* Invoice Financial Summary Box */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5">
              <h3 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                ملخص الفاتورة والأثر المالي
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>عدد الأصناف:</span>
                  <strong className="font-mono text-slate-800">{totalItemsCount}</strong>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>إجمالي القطع (مع البونص):</span>
                  <strong className="font-mono text-slate-800">{totalPiecesCount}</strong>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>الإجمالي بسعر الجمهور:</span>
                  <strong className="font-mono text-slate-800">
                    {totalConsumerAmount.toFixed(2)} ج.م
                  </strong>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>هامش الربح المتوقع:</span>
                  <strong className="font-mono text-emerald-600 font-bold">
                    +{totalProfitMargin.toFixed(2)} ج.م
                  </strong>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-900">صافي التكلفة (المستحق):</span>
                  <strong className="font-mono text-base font-extrabold text-blue-700">
                    {totalNetCost.toFixed(2)} ج.م
                  </strong>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ملاحظات الفاتورة
                </label>
                <textarea
                  rows={2}
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="أي ملاحظات خاصة بالتوريد أو الدفعة..."
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmitInvoice}
                disabled={submittingInvoice || draftLines.length === 0}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                {submittingInvoice ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري التوريد وتحديث المخزن...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>حفظ وتوريد المخزن (F9)</span>
                  </>
                )}
              </button>

              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                تنفذ العملية داخل SQLite Transaction ذرية: زيادة الرصيد، تحديث السعر والصلاحية، وتنظيف النواقص تلقائياً.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: INVOICES HISTORY                                   */}
      {/* ======================================================== */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <span className="text-xs font-bold text-slate-800">
              سجل فواتير التوريد السابقة ({invoicesHistory.length} فاتورة)
            </span>
            <button
              onClick={loadHistory}
              disabled={loadingHistory}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              <span>تحديث السجل</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2.5 px-3 w-20 text-center">رقم الفاتورة</th>
                  <th className="py-2.5 px-3 w-32">رقم الورقية</th>
                  <th className="py-2.5 px-3 min-w-[180px]">اسم المورد</th>
                  <th className="py-2.5 px-3 w-28 text-center">التاريخ</th>
                  <th className="py-2.5 px-3 w-24 text-center">طريقة الدفع</th>
                  <th className="py-2.5 px-3 w-20 text-center">الأصناف</th>
                  <th className="py-2.5 px-3 w-28 text-left">إجمالي القيمة</th>
                  <th className="py-2.5 px-3 w-20 text-center">عرض</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingHistory ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
                      <span>جاري تحميل فواتير المشتريات...</span>
                    </td>
                  </tr>
                ) : invoicesHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      لا توجد فواتير مسجلة
                    </td>
                  </tr>
                ) : (
                  invoicesHistory.map((inv) => (
                    <tr key={inv.invoice_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 text-center font-mono font-bold text-blue-700">
                        #{inv.invoice_id}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600">
                        {inv.paper_invoice_number || '-'}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900">
                        {inv.supplier_name}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {inv.invoice_date}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.payment_method === 'CASH'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {inv.payment_method === 'CASH' ? 'نقدي' : 'آجل'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {inv.items_count || 1}
                      </td>
                      <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                        {inv.total_amount.toFixed(2)} ج.م
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => handleViewInvoiceDetails(inv)}
                          className="p-1 rounded hover:bg-blue-50 text-slate-500 hover:text-blue-700 transition-colors"
                          title="عرض تفاصيل الأصناف"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: SUPPLIERS DIRECTORY                                */}
      {/* ======================================================== */}
      {activeTab === 'suppliers' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs">
            <span className="text-xs font-bold text-slate-800">
              دليل شركات ومخازن الأدوية الـ ({suppliers.length})
            </span>
            <button
              onClick={() => setIsAddSupplierOpen(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة مورد جديد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suppliers.map((s) => (
              <div
                key={s.supplier_id}
                className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs hover:border-blue-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-400">
                      #{s.supplier_id}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mb-1">{s.supplier_name}</h3>
                  {s.phone && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1 font-mono">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{s.phone}</span>
                    </p>
                  )}
                  {s.address && (
                    <p className="text-xs text-slate-500 line-clamp-1">{s.address}</p>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">الفواتير المسجلة:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {s.invoices_count || 0} فاتورة
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice Details Modal */}
      {selectedInvoiceDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    تفاصيل فاتورة التوريد #{selectedInvoiceDetails.invoice.invoice_id}
                  </h3>
                  <span className="text-xs text-slate-500">
                    المورد: {selectedInvoiceDetails.invoice.supplier_name} • التاريخ: {selectedInvoiceDetails.invoice.invoice_date}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedInvoiceDetails(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2 px-3">اسم الصنف</th>
                    <th className="py-2 px-3 text-center">الكمية</th>
                    <th className="py-2 px-3 text-center">بونص</th>
                    <th className="py-2 px-3 text-left">سعر التكلفة</th>
                    <th className="py-2 px-3 text-center">الصلاحية</th>
                    <th className="py-2 px-3 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedInvoiceDetails.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-bold text-slate-900">
                        {item.item_name_en}
                      </td>
                      <td className="py-2 px-3 text-center font-mono">{item.quantity}</td>
                      <td className="py-2 px-3 text-center font-mono text-emerald-600">
                        {item.bonus_quantity || 0}
                      </td>
                      <td className="py-2 px-3 text-left font-mono">
                        {item.buy_price.toFixed(2)} ج.م
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        {item.expiry_date || '-'}
                      </td>
                      <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                        {item.total_price.toFixed(2)} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">
                إجمالي قيمة الفاتورة:
              </span>
              <span className="font-mono font-extrabold text-blue-700 text-sm">
                {selectedInvoiceDetails.invoice.total_amount.toFixed(2)} ج.م
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
          <form
            onSubmit={handleSaveNewSupplier}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>إضافة مورد / شركة توزيع جديدة</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddSupplierOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اسم الشركة / المورد *
                </label>
                <input
                  type="text"
                  required
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="مثال: مخزن الحكمة للأدوية"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  placeholder="مثال: 01012345678"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">العنوان / المحافظة</label>
                <input
                  type="text"
                  value={newSupplierAddress}
                  onChange={(e) => setNewSupplierAddress(e.target.value)}
                  placeholder="مثال: طنطا - شارع النحاس"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddSupplierOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingSupplier}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                {savingSupplier ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>حفظ المورد</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
