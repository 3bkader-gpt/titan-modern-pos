import React, { useState, useEffect, useCallback } from 'react';
import { ItemBarcodeEntry } from '../../../../shared/types';
import { renderCode128SvgMarkup } from '../../../../shared/code128';
import { Printer, Barcode, Plus, Trash2, X, CheckCircle2 } from 'lucide-react';

export interface BarcodeLabelPrintItem {
  item_id: number;
  item_name: string;
  consumer_price: number;
  barcode?: string | null;
  expiry_date?: string | null;
  copies: number;
}

type LabelTemplateSize = 'TWIN_38x12' | 'SINGLE_38x25' | 'SINGLE_50x25';

interface BarcodeLabelModalProps {
  isOpen: boolean;
  items: BarcodeLabelPrintItem[];
  onClose: () => void;
}

const TEMPLATE_SPECS: Record<LabelTemplateSize, { label: string; widthMm: number; heightMm: number; isTwin: boolean }> = {
  TWIN_38x12: { label: 'Twin 2-Up القياسي (38×12.5mm + فاصل 3mm)', widthMm: 38, heightMm: 12.5, isTwin: true },
  SINGLE_38x25: { label: 'مفرد وسط (38×25mm)', widthMm: 38, heightMm: 25, isTwin: false },
  SINGLE_50x25: { label: 'مفرد كبير (50×25mm)', widthMm: 50, heightMm: 25, isTwin: false }
};

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  isOpen,
  items,
  onClose
}) => {
  const [labelItems, setLabelItems] = useState<BarcodeLabelPrintItem[]>([]);
  const [template, setTemplate] = useState<LabelTemplateSize>('TWIN_38x12');
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showExpiry, setShowExpiry] = useState<boolean>(true);
  const [showPharmacyName, setShowPharmacyName] = useState<boolean>(true);

  // Multi-barcode manager for single-item inspection (first item or active item)
  const [activeManageItemId, setActiveManageItemId] = useState<number | null>(null);
  const [barcodesList, setBarcodesList] = useState<ItemBarcodeEntry[]>([]);
  const [newBarcodeInput, setNewBarcodeInput] = useState<string>('');
  const [newBarcodeLabel, setNewBarcodeLabel] = useState<string>('باركود تشغيلة');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    const initItems = async () => {
      const prepared: BarcodeLabelPrintItem[] = [];
      for (const it of items) {
        let code = (it.barcode || '').trim();
        if (!code && window.electronAPI?.ensureItemHasBarcode) {
          try {
            code = await window.electronAPI.ensureItemHasBarcode(it.item_id);
          } catch {
            code = `98${String(it.item_id).padStart(10, '0')}`;
          }
        }
        prepared.push({
          ...it,
          barcode: code || `98${String(it.item_id).padStart(10, '0')}`,
          copies: Math.max(1, Math.round(it.copies || 1))
        });
      }
      setLabelItems(prepared);
      if (prepared.length > 0) {
        setActiveManageItemId(prepared[0].item_id);
      }
    };
    void initItems();
  }, [isOpen, items]);

  const loadBarcodes = useCallback(async (itemId: number) => {
    if (!window.electronAPI?.getItemBarcodes) return;
    try {
      const list = await window.electronAPI.getItemBarcodes(itemId);
      setBarcodesList(list || []);
    } catch {
      setBarcodesList([]);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeManageItemId !== null) {
      void loadBarcodes(activeManageItemId);
    }
  }, [isOpen, activeManageItemId, loadBarcodes]);

  if (!isOpen) return null;

  const handleAddExtraBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeManageItemId || !newBarcodeInput.trim()) return;
    setErrorMsg('');
    try {
      await window.electronAPI.addItemBarcode(activeManageItemId, newBarcodeInput.trim(), newBarcodeLabel.trim());
      setNewBarcodeInput('');
      await loadBarcodes(activeManageItemId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg.replace(/^Error invoking remote method.*?:\s*Error:\s*/i, ''));
    }
  };

  const handleRemoveExtraBarcode = async (id: number) => {
    setErrorMsg('');
    try {
      await window.electronAPI.removeItemBarcode(id);
      if (activeManageItemId) await loadBarcodes(activeManageItemId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg.replace(/^Error invoking remote method.*?:\s*Error:\s*/i, ''));
    }
  };

  const handlePrint = () => {
    const spec = TEMPLATE_SPECS[template];
    const pageWidth = spec.isTwin ? spec.widthMm * 2 + 3 : spec.widthMm;
    const expandedLabels: BarcodeLabelPrintItem[] = [];
    for (const item of labelItems) {
      const count = Math.max(1, item.copies || 1);
      for (let i = 0; i < count; i++) {
        expandedLabels.push(item);
      }
    }
    if (expandedLabels.length === 0) return;

    const renderSingleCell = (it: BarcodeLabelPrintItem) => {
      const svg = renderCode128SvgMarkup(it.barcode || `98${it.item_id}`, { height: 22, quietZoneModules: 4 });
      return `
        <div class="label-cell">
          ${showPharmacyName ? '<div class="ph-title">صيدلية د. مريم الحميلي</div>' : ''}
          <div class="drug-name">${it.item_name.slice(0, 26)}</div>
          <div class="svg-wrap">${svg}</div>
          <div class="meta-row">
            <span class="code-num">${it.barcode}</span>
            ${showPrice ? `<span class="price">${it.consumer_price.toFixed(2)} ج.م</span>` : ''}
            ${showExpiry && it.expiry_date ? `<span class="exp">${it.expiry_date}</span>` : ''}
          </div>
        </div>
      `;
    };

    let pagesHtml = '';
    if (spec.isTwin) {
      for (let i = 0; i < expandedLabels.length; i += 2) {
        pagesHtml += `<div class="label-row-twin">${renderSingleCell(expandedLabels[i])}${
          expandedLabels[i + 1] ? renderSingleCell(expandedLabels[i + 1]) : '<div class="label-cell"></div>'
        }</div>`;
      }
    } else {
      for (const lbl of expandedLabels) {
        pagesHtml += `<div class="label-single">${renderSingleCell(lbl)}</div>`;
      }
    }

    const printWin = window.open('', '_blank', 'width=520,height=640');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>طباعة باركود حراري</title>
        <style>
          @page { size: ${pageWidth}mm ${spec.heightMm}mm; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: Tahoma, Arial, sans-serif; }
          body { background: #fff; color: #000; }
          .label-row-twin {
            display: flex;
            gap: 3mm;
            width: ${pageWidth}mm;
            height: ${spec.heightMm}mm;
            page-break-after: always;
          }
          .label-single {
            width: ${spec.widthMm}mm;
            height: ${spec.heightMm}mm;
            page-break-after: always;
          }
          .label-cell {
            width: ${spec.widthMm}mm;
            height: ${spec.heightMm}mm;
            padding: 0.6mm 1.2mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
          }
          .ph-title { font-size: 5.5pt; font-weight: bold; text-align: center; line-height: 1; }
          .drug-name { font-size: 6.5pt; font-weight: bold; text-align: center; white-space: nowrap; overflow: hidden; line-height: 1.05; }
          .svg-wrap { width: 100%; height: ${spec.isTwin ? '4.8mm' : '11mm'}; display: flex; align-items: center; }
          .svg-wrap svg { width: 100%; height: 100%; }
          .meta-row { display: flex; justify-content: space-between; align-items: center; font-size: 5.5pt; font-weight: bold; direction: ltr; line-height: 1; }
          .price { font-size: 6.5pt; }
        </style>
      </head>
      <body>${pagesHtml}<script>window.onload=function(){window.print();window.close();};</script></body>
      </html>
    `);
    printWin.document.close();
  };

  const previewItem = labelItems.find((i) => i.item_id === activeManageItemId) || labelItems[0];
  const previewSvg = previewItem?.barcode
    ? renderCode128SvgMarkup(previewItem.barcode, { height: 28, quietZoneModules: 5 })
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 font-sans select-none"
      data-modal-open="true"
      dir="rtl"
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">طباعة ليبل الباركود الحراري (Code-128)</h3>
              <p className="text-[11px] text-slate-500">
                دعم مقاسات Zebra / Bixolon / Godex وإدارة تعدد الباركود للصنف
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Template & Visibility Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <label className="block font-bold text-slate-700 mb-1">مقاس الملصق الحراري:</label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value as LabelTemplateSize)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
              >
                {Object.entries(TEMPLATE_SPECS).map(([key, spec]) => (
                  <option key={key} value={key}>
                    {spec.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-4">
              <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={showPharmacyName} onChange={(e) => setShowPharmacyName(e.target.checked)} className="accent-blue-600" />
                <span>اسم الصيدلية</span>
              </label>
              <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="accent-blue-600" />
                <span>السعر</span>
              </label>
              <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={showExpiry} onChange={(e) => setShowExpiry(e.target.checked)} className="accent-blue-600" />
                <span>الصلاحية</span>
              </label>
            </div>
          </div>

          {/* Items & Quantities List */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-2 px-3">الصنف</th>
                  <th className="py-2 px-3 text-center">الباركود</th>
                  <th className="py-2 px-3 text-center">السعر</th>
                  <th className="py-2 px-3 text-center">عدد الليبلات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {labelItems.map((it, idx) => (
                  <tr
                    key={it.item_id}
                    onClick={() => setActiveManageItemId(it.item_id)}
                    className={`cursor-pointer ${
                      activeManageItemId === it.item_id ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2 px-3 font-bold text-slate-900">{it.item_name}</td>
                    <td className="py-2 px-3 text-center font-mono text-slate-700">{it.barcode}</td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-emerald-700">
                      {it.consumer_price.toFixed(2)} ج.م
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={it.copies}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setLabelItems((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, copies: val } : row))
                          );
                        }}
                        className="w-16 px-2 py-1 text-center font-mono font-bold border border-slate-300 rounded-lg"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Live Label Preview + Multi-Barcode Manager */}
          {previewItem && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Visual Label Card */}
              <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-slate-400 mb-2">معاينة حية للملصق</span>
                <div className="w-56 bg-white border border-slate-300 rounded-lg p-2.5 shadow-xs space-y-1">
                  {showPharmacyName && (
                    <div className="text-[10px] font-bold text-center text-slate-700">
                      صيدلية د. مريم الحميلي
                    </div>
                  )}
                  <div className="text-[11px] font-bold text-center text-slate-900 truncate">
                    {previewItem.item_name}
                  </div>
                  <div
                    className="w-full h-9 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-800" dir="ltr">
                    <span>{previewItem.barcode}</span>
                    {showPrice && <span>{previewItem.consumer_price.toFixed(2)} EGP</span>}
                  </div>
                </div>
              </div>

              {/* Extra Barcodes Manager */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5">
                <h4 className="font-bold text-slate-800 text-xs">
                  باركودات الصنف المسجلة ({barcodesList.length})
                </h4>

                <form onSubmit={handleAddExtraBarcode} className="flex gap-1.5">
                  <input
                    type="text"
                    value={newBarcodeInput}
                    onChange={(e) => setNewBarcodeInput(e.target.value)}
                    placeholder="إضافة باركود إضافي..."
                    dir="ltr"
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs outline-none"
                  />
                  <input
                    type="text"
                    value={newBarcodeLabel}
                    onChange={(e) => setNewBarcodeLabel(e.target.value)}
                    placeholder="الوصف"
                    className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] outline-none"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ربط</span>
                  </button>
                </form>

                {errorMsg && (
                  <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                    {errorMsg}
                  </div>
                )}

                <div className="max-h-28 overflow-y-auto divide-y divide-slate-100">
                  {barcodesList.map((b) => (
                    <div key={b.id} className="py-1.5 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800">{b.barcode}</span>
                        <span className="text-slate-500">({b.label})</span>
                        {b.is_primary === 1 && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </div>
                      {b.is_primary !== 1 && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveExtraBarcode(b.id)}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                          title="حذف الباركود الإضافي"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
          >
            إغلاق
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={labelItems.length === 0}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الملصقات ({labelItems.reduce((acc, i) => acc + (i.copies || 1), 0)} ليبل)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
