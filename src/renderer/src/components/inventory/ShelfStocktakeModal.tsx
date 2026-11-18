import React, { useState, useEffect, useCallback } from 'react';
import { Item, StocktakeSessionRecord, PostStocktakeSessionResult } from '../../../../shared/types';
import { ClipboardCheck, Search, CheckCircle2, AlertTriangle, X, Layers } from 'lucide-react';

interface ShelfStocktakePanelProps {
  userId?: number;
  userName?: string;
  onSessionPosted?: (res: PostStocktakeSessionResult) => void;
}

export const ShelfStocktakePanel: React.FC<ShelfStocktakePanelProps> = ({
  userId = 99,
  userName = 'د. مريم الحميلي',
  onSessionPosted
}) => {
  const [shelfFilter, setShelfFilter] = useState<string>('');
  const [scopeLabel, setScopeLabel] = useState<string>('جرد دولاب / رف مخصص');
  const [items, setItems] = useState<Item[]>([]);
  const [countedMap, setCountedMap] = useState<Record<number, string>>({});
  const [sessions, setSessions] = useState<StocktakeSessionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [posting, setPosting] = useState<boolean>(false);
  const [scanCode, setScanCode] = useState<string>('');
  const [banner, setBanner] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadShelfItems = useCallback(async () => {
    if (!window.electronAPI?.getShelfItemsForStocktake) return;
    setLoading(true);
    try {
      const [rows, hist] = await Promise.all([
        window.electronAPI.getShelfItemsForStocktake(shelfFilter, 120),
        window.electronAPI.getStocktakeSessions(15)
      ]);
      setItems(rows || []);
      setSessions(hist || []);
    } catch (err) {
      console.error('Failed to load stocktake shelf items:', err);
    } finally {
      setLoading(false);
    }
  }, [shelfFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadShelfItems();
    }, 180);
    return () => clearTimeout(t);
  }, [loadShelfItems]);

  const handleBarcodeScanIncrement = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !scanCode.trim() || !window.electronAPI) return;
    e.preventDefault();
    const hits = await window.electronAPI.searchItems(scanCode.trim(), false, 1);
    if (hits && hits.length > 0) {
      const hit = hits[0];
      setItems(prev => (prev.some(i => i.item_id === hit.item_id) ? prev : [hit, ...prev]));
      setCountedMap(prev => {
        const cur = prev[hit.item_id] !== undefined ? Number(prev[hit.item_id]) : 0;
        return { ...prev, [hit.item_id]: String((Number.isFinite(cur) ? cur : 0) + 1) };
      });
      setScanCode('');
      setBanner({ text: `تم عد +1 للصنف ${hit.item_name_en}`, type: 'success' });
    } else {
      setBanner({ text: `لم يتم العثور على صنف بالباركود: ${scanCode}`, type: 'error' });
    }
  };

  const modifiedLines = items
    .filter(it => countedMap[it.item_id] !== undefined && countedMap[it.item_id] !== '')
    .map(it => {
      const counted = Math.max(0, Number(countedMap[it.item_id]) || 0);
      const unitCost = it.buy_price && it.buy_price > 0 ? it.buy_price : Number(it.consumer_price || 0) * 0.75;
      const varianceQty = counted - it.current_stock;
      const varianceCost = Math.round(varianceQty * unitCost * 100) / 100;
      return { item: it, counted, varianceQty, varianceCost };
    });

  const totalNetVarianceCost = modifiedLines.reduce((acc, l) => acc + l.varianceCost, 0);

  const handlePostSession = async () => {
    if (modifiedLines.length === 0 || !window.electronAPI?.createAndPostStocktakeSession) return;
    setPosting(true);
    setBanner(null);
    try {
      const res = await window.electronAPI.createAndPostStocktakeSession({
        scopeLabel: shelfFilter.trim() ? `جرد ${shelfFilter.trim()}` : scopeLabel,
        userId,
        userName,
        lines: modifiedLines.map(l => ({ itemId: l.item.item_id, countedQty: l.counted }))
      });
      setCountedMap({});
      setBanner({
        text: `تم اعتماد جلسة الجرد #${res.session_id} (${res.lines_count} صنفاً) بصافي فرق ${res.total_variance_cost.toFixed(2)} ج.م — قيد GL: ${res.gl_account}`,
        type: 'success'
      });
      await loadShelfItems();
      onSessionPosted?.(res);
    } catch (err) {
      setBanner({ text: err instanceof Error ? err.message : 'فشل اعتماد الجرد.', type: 'error' });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">اسم / رمز الدولاب أو الرف</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={shelfFilter}
              onChange={e => setShelfFilter(e.target.value)}
              placeholder="مثال: دولاب A أو رف 2 أو الثلاجة"
              className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">عنوان محضر الجرد</label>
          <input
            type="text"
            value={scopeLabel}
            onChange={e => setScopeLabel(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white font-semibold"
          />
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">عدّ سريع بمسح الباركود (+1)</label>
          <input
            type="text"
            value={scanCode}
            onChange={e => setScanCode(e.target.value)}
            onKeyDown={handleBarcodeScanIncrement}
            placeholder="امسح الباركود واضغط Enter..."
            className="w-full px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50/40 focus:bg-white font-mono"
          />
        </div>

        <div className="flex items-end justify-end">
          <button
            type="button"
            disabled={posting || modifiedLines.length === 0}
            onClick={handlePostSession}
            className="w-full py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>
              {posting ? 'جاري الترحيل...' : `اعتماد الجرد (${modifiedLines.length} صنف)`}
            </span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {banner.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Summary Bar */}
      {modifiedLines.length > 0 && (
        <div className="bg-slate-900 text-white rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
          <div>الأصناف المعدود لها رصيد فعلي: <strong>{modifiedLines.length}</strong></div>
          <div className="font-mono">
            صافي قيمة الفروق (بالتكلفة):{' '}
            <strong className={totalNetVarianceCost < 0 ? 'text-rose-300' : 'text-emerald-300'}>
              {totalNetVarianceCost >= 0 ? `+${totalNetVarianceCost.toFixed(2)}` : totalNetVarianceCost.toFixed(2)} ج.م
            </strong>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0">
              <tr>
                <th className="py-2 px-3">الصنف</th>
                <th className="py-2 px-3">الموقع (الرف)</th>
                <th className="py-2 px-3 text-center">رصيد النظام</th>
                <th className="py-2 px-3 text-center w-32">العد الفعلي</th>
                <th className="py-2 px-3 text-center">الفرق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">جاري التحميل...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">لا توجد أصناف مطابقة لهذا الرف.</td></tr>
              ) : (
                items.map(it => {
                  const valStr = countedMap[it.item_id] ?? '';
                  const hasVal = valStr !== '';
                  const countedNum = hasVal ? Number(valStr) || 0 : it.current_stock;
                  const diff = hasVal ? Math.round((countedNum - it.current_stock) * 100) / 100 : 0;
                  return (
                    <tr key={it.item_id} className={hasVal && diff !== 0 ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                      <td className="py-2 px-3 font-bold text-slate-900" dir="ltr">{it.item_name_en}</td>
                      <td className="py-2 px-3 text-slate-600">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[11px]">
                          <Layers className="w-3 h-3 text-slate-400" />
                          {it.shelf_location || 'غير مسكن'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-700">{it.current_stock}</td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          value={valStr}
                          placeholder={String(it.current_stock)}
                          onChange={e => setCountedMap(prev => ({ ...prev, [it.item_id]: e.target.value }))}
                          className="w-24 px-2 py-1 text-center font-mono font-bold border border-slate-300 rounded bg-white"
                        />
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold">
                        {!hasVal ? (
                          <span className="text-slate-300">—</span>
                        ) : diff === 0 ? (
                          <span className="text-emerald-600">0</span>
                        ) : (
                          <span className={diff < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Stocktake Sessions */}
      {sessions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 text-xs space-y-2">
          <div className="font-bold text-slate-800">سجل محاضر الجرد المعتمدة:</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {sessions.slice(0, 6).map(s => (
              <div key={s.session_id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-800">#{s.session_id} — {s.scope_label}</div>
                  <div className="text-[10px] text-slate-500">{s.user_name} • {s.posted_at}</div>
                </div>
                <span className={`font-mono font-bold ${s.total_variance_cost < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {s.total_variance_cost >= 0 ? `+${s.total_variance_cost.toFixed(2)}` : s.total_variance_cost.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface ShelfStocktakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: number;
  userName?: string;
  onSessionPosted?: (res: PostStocktakeSessionResult) => void;
}

export const ShelfStocktakeModal: React.FC<ShelfStocktakeModalProps> = ({
  isOpen,
  onClose,
  userId,
  userName,
  onSessionPosted
}) => {
  if (!isOpen) return null;
  return (
    <div data-modal-open="true" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-black">الجرد الجزئي بالدولاب والرف (Stocktake)</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <ShelfStocktakePanel userId={userId} userName={userName} onSessionPosted={onSessionPosted} />
        </div>
      </div>
    </div>
  );
};
