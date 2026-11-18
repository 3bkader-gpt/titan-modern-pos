import React, { useState, useEffect, useCallback } from 'react';
import {
  StockAndLedgerAuditReport,
  DuplicateCandidatePair,
  Item
} from '../../../../shared/types';
import { ShieldCheck, GitMerge, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface IntegrityAndMergeTabProps {
  isAdmin?: boolean;
  managerName?: string;
  onMerged?: () => void;
}

export const IntegrityAndMergeTab: React.FC<IntegrityAndMergeTabProps> = ({
  isAdmin = true,
  managerName = 'د. مريم الحميلي',
  onMerged
}) => {
  const [audit, setAudit] = useState<StockAndLedgerAuditReport | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidatePair[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [banner, setBanner] = useState<string>('');

  // Manual merge pair inputs
  const [primaryQuery, setPrimaryQuery] = useState<string>('');
  const [dupQuery, setDupQuery] = useState<string>('');
  const [primaryHits, setPrimaryHits] = useState<Item[]>([]);
  const [dupHits, setDupHits] = useState<Item[]>([]);
  const [selectedPrimary, setSelectedPrimary] = useState<Item | null>(null);
  const [selectedDuplicate, setSelectedDuplicate] = useState<Item | null>(null);

  const loadAudit = useCallback(async () => {
    if (!window.electronAPI?.runStockAndLedgerIntegrityAudit) return;
    setLoading(true);
    try {
      const [auditRes, dupRes] = await Promise.all([
        window.electronAPI.runStockAndLedgerIntegrityAudit(),
        window.electronAPI.findDuplicateItemCandidates(40)
      ]);
      setAudit(auditRes);
      setDuplicates(dupRes || []);
    } catch (err) {
      console.error('Failed running integrity audit:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const searchManual = async (q: string, setter: (items: Item[]) => void) => {
    if (!q.trim() || !window.electronAPI) {
      setter([]);
      return;
    }
    const res = await window.electronAPI.searchItems(q.trim(), false, 8);
    setter(res || []);
  };

  const handleMergePair = async (primaryId: number, duplicateId: number) => {
    if (!isAdmin) {
      setBanner('دمج الأصناف متاح للمدير (ADMIN) فقط.');
      return;
    }
    if (!window.electronAPI?.mergeDuplicateItems) return;
    try {
      const res = await window.electronAPI.mergeDuplicateItems(primaryId, duplicateId, managerName);
      setBanner(
        `تم دمج #${res.duplicate_item_id} (${res.duplicate_item_name}) في #${res.primary_item_id} بنجاح — نُقل ${res.sales_lines_moved} سطر بيع و${res.purchase_lines_moved} شراء و${res.barcodes_moved} باركود.`
      );
      setSelectedPrimary(null);
      setSelectedDuplicate(null);
      setPrimaryQuery('');
      setDupQuery('');
      await loadAudit();
      onMerged?.();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'فشل دمج الأصناف.');
    }
  };

  return (
    <div className="space-y-4 text-xs">
      {banner && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center justify-between">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner('')} className="cursor-pointer">×</button>
        </div>
      )}

      {/* Stock vs GL Integrity Monitor */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-slate-900">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>مراقب سلامة المخزون وتطابقه مع الأستاذ العام (GL)</span>
          </div>
          <button
            type="button"
            onClick={loadAudit}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>فحص الآن</span>
          </button>
        </div>

        {audit && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">قيمة المخزون الفعلي بالتكلفة</div>
                <div className="font-mono font-black text-base text-slate-900">{audit.inventory_items_cost_total.toLocaleString('en-US')} ج.م</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">رصيد حساب المخزون في GL</div>
                <div className="font-mono font-black text-base text-slate-900">{audit.gl_inventory_balance.toLocaleString('en-US')} ج.م</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">توازن الأستاذ العام (Debit = Credit)</div>
                <div className={`font-mono font-black text-base flex items-center gap-1 ${audit.gl_integrity.balanced ? 'text-emerald-700' : 'text-rose-700'}`}>
                  <CheckCircle2 className="w-4 h-4" />
                  {audit.gl_integrity.diff.toFixed(2)} ج.م
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 text-[11px]">أصناف برصيد سالب / تكلفة شاذة</div>
                <div className="font-mono font-black text-base text-amber-700">
                  {audit.negative_stock_items.length} سالب • {audit.below_cost_items.length} تكلفة
                </div>
              </div>
            </div>

            {(audit.negative_stock_items.length > 0 || audit.below_cost_items.length > 0) && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>تنبيهات شذوذ الأرصدة والتكلفة:</span>
                </div>
                {audit.negative_stock_items.slice(0, 5).map(n => (
                  <div key={n.item_id} className="font-mono text-[11px]">
                    • #{n.item_id} {n.item_name_en} — رصيد: {n.current_stock}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Duplicate Merge Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 font-black text-slate-900">
          <GitMerge className="w-5 h-5 text-blue-600" />
          <span>دمج الأصناف المكررة بأمان (للمدير ADMIN)</span>
        </div>

        {/* Manual Merge Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <label className="block font-bold text-emerald-800 mb-1">1. الصنف الأساسي (سيبقى بعد الدمج)</label>
            <input
              type="text"
              value={primaryQuery}
              onChange={e => {
                setPrimaryQuery(e.target.value);
                void searchManual(e.target.value, setPrimaryHits);
              }}
              placeholder="ابحث عن الصنف الأساسي..."
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
            />
            {selectedPrimary && (
              <div className="mt-1 px-2 py-1 rounded bg-emerald-100 text-emerald-900 font-bold">
                المحدد: #{selectedPrimary.item_id} — {selectedPrimary.item_name_en} (رصيد {selectedPrimary.current_stock})
              </div>
            )}
            {primaryHits.length > 0 && !selectedPrimary && (
              <div className="mt-1 max-h-28 overflow-y-auto bg-white border rounded divide-y">
                {primaryHits.map(h => (
                  <button key={h.item_id} type="button" onClick={() => { setSelectedPrimary(h); setPrimaryHits([]); }} className="w-full text-right px-2 py-1 hover:bg-blue-50 flex justify-between cursor-pointer">
                    <span>#{h.item_id} {h.item_name_en}</span>
                    <span className="font-mono">{h.current_stock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block font-bold text-rose-800 mb-1">2. الصنف المكرر (سيُنقل رصيده وفواتيره ويُحذف)</label>
            <input
              type="text"
              value={dupQuery}
              onChange={e => {
                setDupQuery(e.target.value);
                void searchManual(e.target.value, setDupHits);
              }}
              placeholder="ابحث عن الصنف المكرر..."
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
            />
            {selectedDuplicate && (
              <div className="mt-1 px-2 py-1 rounded bg-rose-100 text-rose-900 font-bold">
                المحدد: #{selectedDuplicate.item_id} — {selectedDuplicate.item_name_en} (رصيد {selectedDuplicate.current_stock})
              </div>
            )}
            {dupHits.length > 0 && !selectedDuplicate && (
              <div className="mt-1 max-h-28 overflow-y-auto bg-white border rounded divide-y">
                {dupHits.map(h => (
                  <button key={h.item_id} type="button" onClick={() => { setSelectedDuplicate(h); setDupHits([]); }} className="w-full text-right px-2 py-1 hover:bg-blue-50 flex justify-between cursor-pointer">
                    <span>#{h.item_id} {h.item_name_en}</span>
                    <span className="font-mono">{h.current_stock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="button"
              disabled={!isAdmin || !selectedPrimary || !selectedDuplicate || selectedPrimary.item_id === selectedDuplicate.item_id}
              onClick={() => selectedPrimary && selectedDuplicate && void handleMergePair(selectedPrimary.item_id, selectedDuplicate.item_id)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold cursor-pointer"
            >
              تنفيذ الدمج الآمن ونقل السجل التاريخي
            </button>
          </div>
        </div>

        {/* Auto-detected Duplicate Candidates */}
        {duplicates.length > 0 && (
          <div className="space-y-2">
            <div className="font-bold text-slate-700">مكررات مكتشفة تلقائياً بالاسم ({duplicates.length}):</div>
            <div className="divide-y border border-slate-200 rounded-xl overflow-hidden">
              {duplicates.slice(0, 20).map(pair => (
                <div key={`${pair.primary_item_id}-${pair.duplicate_item_id}`} className="p-2.5 flex items-center justify-between bg-white hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-900" dir="ltr">{pair.primary_name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      الأساسي #{pair.primary_item_id} (رصيد {pair.primary_stock}) ← المكرر #{pair.duplicate_item_id} (رصيد {pair.duplicate_stock})
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => void handleMergePair(pair.primary_item_id, pair.duplicate_item_id)}
                    className="px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 font-bold cursor-pointer transition-colors"
                  >
                    دمج في #{pair.primary_item_id}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
