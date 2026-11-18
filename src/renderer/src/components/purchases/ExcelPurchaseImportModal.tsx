import React, { useState, useEffect } from 'react';
import {
  Supplier,
  SupplierColumnMapping,
  ImportedPurchaseRowInput,
  MatchedImportPurchaseRow,
  Item
} from '../../../../shared/types';
import { parseDelimitedSheet } from '../../../../shared/csv';
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Search } from 'lucide-react';

export interface ImportedDraftLineOutput {
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

interface ExcelPurchaseImportModalProps {
  isOpen: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onImportLines: (lines: ImportedDraftLineOutput[], savedMapJson: string) => void;
}

function guessMapping(headers: string[], savedJson?: string | null): SupplierColumnMapping {
  if (savedJson && savedJson.trim()) {
    try {
      const parsed = JSON.parse(savedJson) as SupplierColumnMapping;
      const validSet = new Set(headers);
      const allEmptyOrValid = Object.values(parsed).some(v => v && validSet.has(v));
      if (allEmptyOrValid) return parsed;
    } catch {
      // ignore invalid saved json
    }
  }

  const pick = (patterns: RegExp[]): string => {
    for (const pat of patterns) {
      const found = headers.find(h => pat.test(h.trim()));
      if (found) return found;
    }
    return '';
  };

  return {
    barcodeCol: pick([/barcode/i, /باركود/i, /ean/i, /gtin/i, /international/i]),
    itemIdCol: pick([/^item.?id$/i, /^id$/i, /^code$/i, /كود الصنف/i, /^كود$/i]),
    itemNameCol: pick([/item.?name/i, /^name$/i, /اسم/i, /product/i, /drug/i, /الصنف/i]),
    quantityCol: pick([/qty/i, /quant/i, /كمي/i, /الكمي/i]),
    bonusCol: pick([/bonus/i, /بونص/i, /free/i]),
    consumerPriceCol: pick([/consumer/i, /public/i, /سعر الجمهور/i, /سعر البيع/i, /^price$/i]),
    discountPctCol: pick([/disc/i, /خصم/i]),
    buyPriceCol: pick([/buy/i, /cost/i, /net/i, /تكلف/i, /شراء/i]),
    expiryDateCol: pick([/exp/i, /صلاح/i, /انتها/i])
  };
}

export const ExcelPurchaseImportModal: React.FC<ExcelPurchaseImportModalProps> = ({
  isOpen,
  supplier,
  onClose,
  onImportLines
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawText, setRawText] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<SupplierColumnMapping>({});
  const [matchedRows, setMatchedRows] = useState<MatchedImportPurchaseRow[]>([]);
  const [matching, setMatching] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Inline manual item search for red UNMATCHED rows
  const [manualSearchIdx, setManualSearchIdx] = useState<number | null>(null);
  const [manualQuery, setManualQuery] = useState<string>('');
  const [manualHits, setManualHits] = useState<Item[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setRawText('');
      setHeaders([]);
      setSheetRows([]);
      setMatchedRows([]);
      setErrorMsg('');
      setManualSearchIdx(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (manualSearchIdx === null || !manualQuery.trim() || !window.electronAPI) {
      setManualHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI.searchItems(manualQuery.trim(), false, 12);
        setManualHits(res || []);
      } catch {
        setManualHits([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [manualSearchIdx, manualQuery]);

  if (!isOpen) return null;

  const parseAndAdvance = (textInput: string) => {
    const parsed = parseDelimitedSheet(textInput);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setErrorMsg('تعذر قراءة صفوف صالحة. تأكد من وجود سطر عناوين وبيانات مفصولة بفاصلة أو Tab.');
      return;
    }
    setErrorMsg('');
    setHeaders(parsed.headers);
    setSheetRows(parsed.rows);
    setMapping(guessMapping(parsed.headers, supplier?.excel_column_map_json));
    setStep(2);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setRawText(content);
      parseAndAdvance(content);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleRunSmartMatch = async () => {
    if (!window.electronAPI) return;
    setMatching(true);
    setErrorMsg('');
    try {
      const colIdx = (colName?: string) => (colName ? headers.indexOf(colName) : -1);
      const bcI = colIdx(mapping.barcodeCol);
      const idI = colIdx(mapping.itemIdCol);
      const nameI = colIdx(mapping.itemNameCol);
      const qtyI = colIdx(mapping.quantityCol);
      const bonusI = colIdx(mapping.bonusCol);
      const cpI = colIdx(mapping.consumerPriceCol);
      const discI = colIdx(mapping.discountPctCol);
      const buyI = colIdx(mapping.buyPriceCol);
      const expI = colIdx(mapping.expiryDateCol);

      const inputs: ImportedPurchaseRowInput[] = sheetRows.map((cells, idx) => ({
        rowIndex: idx + 1,
        barcode: bcI >= 0 ? cells[bcI] : '',
        itemId: idI >= 0 ? Number(cells[idI]) || undefined : undefined,
        itemName: nameI >= 0 ? cells[nameI] : '',
        quantity: qtyI >= 0 ? Number(cells[qtyI]) || 1 : 1,
        bonusQuantity: bonusI >= 0 ? Number(cells[bonusI]) || 0 : 0,
        consumerPrice: cpI >= 0 ? Number(cells[cpI]) || undefined : undefined,
        discountPct: discI >= 0 ? Number(cells[discI]) || undefined : undefined,
        buyPrice: buyI >= 0 ? Number(cells[buyI]) || undefined : undefined,
        expiryDate: expI >= 0 ? cells[expI] : ''
      }));

      const mapJson = JSON.stringify(mapping);
      const result = await window.electronAPI.matchImportedPurchaseRows(
        inputs,
        supplier?.supplier_id,
        mapJson
      );
      setMatchedRows(result || []);
      setStep(3);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشلت مطابقة الأصناف.');
    } finally {
      setMatching(false);
    }
  };

  const assignManualItem = (rowIdx: number, item: Item) => {
    setMatchedRows(prev =>
      prev.map(r => {
        if (r.rowIndex !== rowIdx) return r;
        const cp = r.resolvedConsumerPrice > 0 ? r.resolvedConsumerPrice : item.consumer_price;
        const disc = r.resolvedDiscountPct > 0 ? r.resolvedDiscountPct : (item.discount_pct || 0);
        const buy = r.resolvedBuyPrice > 0
          ? r.resolvedBuyPrice
          : disc > 0
            ? Math.round(cp * (1 - disc / 100) * 100) / 100
            : (item.buy_price || 0);
        return {
          ...r,
          matchStatus: 'NAME',
          matchedItem: item,
          resolvedConsumerPrice: cp,
          resolvedDiscountPct: disc,
          resolvedBuyPrice: buy,
          resolvedLineTotal: Math.round(r.resolvedQuantity * buy * 100) / 100
        };
      })
    );
    setManualSearchIdx(null);
    setManualQuery('');
    setManualHits([]);
  };

  const matchedCount = matchedRows.filter(r => r.matchedItem && r.matchStatus !== 'UNMATCHED').length;
  const unmatchedCount = matchedRows.length - matchedCount;

  const handleConfirmImport = () => {
    const validLines: ImportedDraftLineOutput[] = matchedRows
      .filter(r => r.matchedItem)
      .map(r => {
        const it = r.matchedItem!;
        return {
          item_id: it.item_id,
          item_name_en: it.item_name_en,
          item_name_ar: it.item_name_ar,
          original_consumer_price: it.consumer_price,
          consumer_price: r.resolvedConsumerPrice || it.consumer_price,
          discount_pct: r.resolvedDiscountPct,
          buy_price: r.resolvedBuyPrice,
          quantity: r.resolvedQuantity,
          bonus_quantity: r.resolvedBonus,
          expiry_date: r.resolvedExpiryDate || it.expiry_date || '',
          line_total: r.resolvedLineTotal
        };
      });

    if (validLines.length === 0) {
      setErrorMsg('لا توجد أصناف مطابقة للإدراج. قم بمطابقة صف واحد على الأقل.');
      return;
    }
    onImportLines(validLines, JSON.stringify(mapping));
    onClose();
  };

  return (
    <div data-modal-open="true" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-black">استيراد فاتورة شراء مخزن من Excel / CSV</h2>
              <p className="text-[11px] text-slate-300">
                المورد المحدد: <strong className="text-white">{supplier?.supplier_name || 'عام'}</strong> • يحفظ تفضيل الأعمدة لكل مورد تلقائياً
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3 text-xs font-bold">
          <span className={step === 1 ? 'text-blue-700' : 'text-emerald-700'}>1. رفع ملف CSV أو لصق من Excel</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className={step === 2 ? 'text-blue-700' : step > 2 ? 'text-emerald-700' : 'text-slate-400'}>2. ربط الأعمدة</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className={step === 3 ? 'text-blue-700' : 'text-slate-400'}>3. المعاينة والمطابقة الذكية</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50/40 hover:bg-blue-50 cursor-pointer transition-colors">
                <Upload className="w-7 h-7 text-blue-600" />
                <span className="text-sm font-bold text-slate-800">اختر ملف CSV / TSV صادر من المخزن (المتحدة / ابن سينا / فارما أوفر سيز)</span>
                <span className="text-xs text-slate-500">أو الصق الصفوف المنسوخة مباشرة من Excel في الصندوق أدناه</span>
                <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">أو لصق البيانات مباشرة (CSV / Tab من Excel):</label>
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={'Barcode,Item Name,Qty,Bonus,Consumer Price,Discount %,Expiry\n6221045011286,AUGMENTIN 625MG,5,1,96,20,12-2027'}
                  className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-hidden"
                  dir="ltr"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!rawText.trim()}
                  onClick={() => parseAndAdvance(rawText)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                >
                  تحليل الأعمدة ومتابعة
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600">
                تم قراءة <strong>{sheetRows.length}</strong> صف و<strong>{headers.length}</strong> عمود. تأكد من ربط كل عمود بالملف:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {(
                  [
                    ['barcodeCol', 'الباركود (Barcode)'],
                    ['itemNameCol', 'اسم الصنف (Item Name)'],
                    ['itemIdCol', 'كود الصنف (Item ID)'],
                    ['quantityCol', 'الكمية (Qty)'],
                    ['bonusCol', 'البونص (Bonus)'],
                    ['consumerPriceCol', 'سعر الجمهور (Consumer Price)'],
                    ['discountPctCol', 'نسبة الخصم % (Discount)'],
                    ['buyPriceCol', 'سعر الشراء الصافي (Cost)'],
                    ['expiryDateCol', 'تاريخ الصلاحية (Expiry)']
                  ] as Array<[keyof SupplierColumnMapping, string]>
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className="block font-bold text-slate-700 mb-1">{label}</label>
                    <select
                      value={mapping[field] || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold"
                    >
                      <option value="">-- غير محدد --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={() => setStep(1)} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer">
                  رجوع
                </button>
                <button
                  type="button"
                  disabled={matching}
                  onClick={handleRunSmartMatch}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  {matching ? 'جاري المطابقة...' : 'تشغيل المطابقة الذكية ومعاينة الصفوف'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> مطابق: {matchedCount}
                  </span>
                  <span className="text-rose-700 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> غير مطابق (يتطلب اختيار): {unmatchedCount}
                  </span>
                </div>
                <button type="button" onClick={() => setStep(2)} className="text-blue-600 hover:underline font-bold cursor-pointer">
                  تعديل ربط الأعمدة
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">بيانات الشيت</th>
                      <th className="py-2 px-3">حالة المطابقة</th>
                      <th className="py-2 px-3">الصنف المطابق في النظام</th>
                      <th className="py-2 px-2 text-center">كمية / بونص</th>
                      <th className="py-2 px-2 text-center">الجمهور / التكلفة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matchedRows.map(row => {
                      const isUnmatched = !row.matchedItem || row.matchStatus === 'UNMATCHED';
                      return (
                        <tr key={row.rowIndex} className={isUnmatched ? 'bg-rose-50/90' : 'bg-white'}>
                          <td className="py-2 px-3 font-mono text-slate-500">{row.rowIndex}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-800" dir="ltr">{row.input.itemName || '—'}</div>
                            {row.input.barcode && <div className="text-[10px] font-mono text-slate-500">{row.input.barcode}</div>}
                          </td>
                          <td className="py-2 px-3">
                            {isUnmatched ? (
                              <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-bold text-[10px]">غير مطابق</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">{row.matchStatus}</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {row.matchedItem ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-900" dir="ltr">{row.matchedItem.item_name_en}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualSearchIdx(row.rowIndex);
                                    setManualQuery(row.input.itemName || '');
                                  }}
                                  className="text-[10px] text-blue-600 hover:underline shrink-0 cursor-pointer"
                                >
                                  تغيير
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {manualSearchIdx === row.rowIndex ? (
                                  <div className="relative">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={manualQuery}
                                      onChange={e => setManualQuery(e.target.value)}
                                      placeholder="ابحث عن الصنف لربطه..."
                                      className="w-full px-2 py-1 rounded border border-blue-400 bg-white text-xs"
                                    />
                                    {manualHits.length > 0 && (
                                      <div className="mt-1 max-h-32 overflow-y-auto bg-white border border-slate-200 rounded shadow-lg divide-y divide-slate-100">
                                        {manualHits.map(hit => (
                                          <button
                                            key={hit.item_id}
                                            type="button"
                                            onClick={() => assignManualItem(row.rowIndex, hit)}
                                            className="w-full text-right px-2 py-1 hover:bg-blue-50 text-[11px] flex justify-between cursor-pointer"
                                          >
                                            <span className="font-bold">{hit.item_name_en}</span>
                                            <span className="font-mono text-slate-500">{hit.consumer_price.toFixed(2)}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setManualSearchIdx(row.rowIndex);
                                      setManualQuery(row.input.itemName || '');
                                    }}
                                    className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Search className="w-3 h-3" /> ربط يدوي بصنف
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center font-mono">
                            {row.resolvedQuantity} + {row.resolvedBonus} بونص
                          </td>
                          <td className="py-2 px-2 text-center font-mono">
                            {row.resolvedConsumerPrice.toFixed(2)} / <strong>{row.resolvedBuyPrice.toFixed(2)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button type="button" onClick={onClose} className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer">
            إغلاق
          </button>
          {step === 3 && (
            <button
              type="button"
              disabled={matchedCount === 0}
              onClick={handleConfirmImport}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
            >
              إدراج ({matchedCount}) صنف في فاتورة المشتريات
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
