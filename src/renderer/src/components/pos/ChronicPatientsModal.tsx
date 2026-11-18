import React, { useState, useEffect } from 'react';
import {
  ChronicPatient,
  ChronicPatientItem,
  SaveChronicPatientPayload,
  InsuranceProvider,
  InsuranceClaimRecord,
  Item
} from '../../../../shared/types';
import {
  HeartPulse,
  X,
  Search,
  Plus,
  Trash2,
  Calendar,
  Phone,
  Pill,
  ShoppingBag,
  Shield,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText
} from 'lucide-react';
import { playBeepSuccess } from './soundEffects';

interface ChronicPatientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPrescriptionToCart: (
    items: Array<{
      item_id: number;
      item_name: string;
      unit_price: number;
      quantity: number;
      generic_name?: string;
      package_units?: number;
    }>,
    patient: ChronicPatient
  ) => void;
}

export const ChronicPatientsModal: React.FC<ChronicPatientsModalProps> = ({
  isOpen,
  onClose,
  onLoadPrescriptionToCart
}) => {
  const [activeTab, setActiveTab] = useState<'PATIENTS' | 'INSURANCE'>('PATIENTS');
  
  // Chronic Patients State
  const [patients, setPatients] = useState<ChronicPatient[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<ChronicPatient | null>(null);
  const [isEditingPatient, setIsEditingPatient] = useState<boolean>(false);
  const [patientForm, setPatientForm] = useState<SaveChronicPatientPayload>({
    patient_name: '',
    phone: '',
    conditions: '',
    refill_interval_days: 30,
    notes: '',
    items: []
  });

  // Drug Search for Prescription
  const [drugSearchQuery, setDrugSearchQuery] = useState<string>('');
  const [drugSearchResults, setDrugSearchResults] = useState<Item[]>([]);
  const [selectedPrescriptionItems, setSelectedPrescriptionItems] = useState<ChronicPatientItem[]>([]);

  // Insurance State
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [claims, setClaims] = useState<InsuranceClaimRecord[]>([]);
  const [claimsFilter, setClaimsFilter] = useState<string>('ALL');
  const [selectedProviderForSettle, setSelectedProviderForSettle] = useState<InsuranceProvider | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [isAddingProvider, setIsAddingProvider] = useState<boolean>(false);
  const [newProviderName, setNewProviderName] = useState<string>('');
  const [newProviderCopay, setNewProviderCopay] = useState<number>(20);
  const [newProviderPhone, setNewProviderPhone] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      loadPatients();
      loadInsuranceData();
    }
  }, [isOpen]);

  const loadPatients = async () => {
    if (window.electronAPI) {
      try {
        const data = await window.electronAPI.getChronicPatients(searchQuery);
        setPatients(data || []);
      } catch (err) {
        console.error('Failed to load chronic patients:', err);
      }
    }
  };

  const loadInsuranceData = async () => {
    if (window.electronAPI) {
      try {
        const provs = await window.electronAPI.getInsuranceProviders();
        setProviders(provs || []);
        const clms = await window.electronAPI.getInsuranceClaims(undefined, claimsFilter);
        setClaims(clms || []);
      } catch (err) {
        console.error('Failed to load insurance data:', err);
      }
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'INSURANCE') {
      loadInsuranceData();
    }
  }, [claimsFilter, activeTab, isOpen]);

  // Drug search debounce
  useEffect(() => {
    if (!drugSearchQuery.trim()) {
      setDrugSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      if (window.electronAPI) {
        try {
          const res = await window.electronAPI.searchItems(drugSearchQuery, false, 8);
          setDrugSearchResults(res || []);
        } catch (err) {
          console.error('Drug search error:', err);
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [drugSearchQuery]);

  if (!isOpen) return null;

  const handleSelectPatient = (patient: ChronicPatient) => {
    setSelectedPatient(patient);
    setIsEditingPatient(false);
    setSelectedPrescriptionItems(patient.items || []);
  };

  const handleStartNewPatient = () => {
    setSelectedPatient(null);
    setIsEditingPatient(true);
    setPatientForm({
      patient_name: '',
      phone: '',
      conditions: 'ضغط وسكر',
      refill_interval_days: 30,
      notes: '',
      items: []
    });
    setSelectedPrescriptionItems([]);
  };

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientForm.patient_name.trim()) return;

    try {
      setLoading(true);
      if (window.electronAPI) {
        const payload: SaveChronicPatientPayload = {
          ...patientForm,
          patient_id: selectedPatient?.patient_id,
          items: selectedPrescriptionItems.map((it) => ({
            item_id: it.item_id,
            dosage_notes: it.dosage_notes || '',
            quantity: it.quantity || 1
          }))
        };
        const saved = await window.electronAPI.saveChronicPatient(payload);
        playBeepSuccess();
        await loadPatients();
        setSelectedPatient(saved);
        setIsEditingPatient(false);
      }
    } catch (err) {
      console.error('Failed to save patient:', err);
      alert('فشل حفظ بيانات المريض المزمن: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePatient = async (patientId: number) => {
    if (!confirm('هل أنت متأكد من حذف ملف هذا المريض المزمن وروشتته؟')) return;
    try {
      if (window.electronAPI) {
        await window.electronAPI.deleteChronicPatient(patientId);
        playBeepSuccess();
        setSelectedPatient(null);
        await loadPatients();
      }
    } catch (err) {
      console.error('Failed to delete patient:', err);
    }
  };

  const handleAddDrugToPrescription = (item: Item) => {
    if (selectedPrescriptionItems.some((it) => it.item_id === item.item_id)) {
      return;
    }
    const newItem: ChronicPatientItem = {
      id: 0,
      patient_id: selectedPatient?.patient_id || 0,
      item_id: item.item_id,
      item_name_en: item.item_name_en,
      item_name_ar: item.item_name_ar,
      consumer_price: item.consumer_price,
      current_stock: item.current_stock,
      dosage_notes: 'قرص يومياً',
      quantity: 1
    };
    setSelectedPrescriptionItems((prev) => [...prev, newItem]);
    setDrugSearchQuery('');
    setDrugSearchResults([]);
  };

  const handleRemovePrescriptionItem = (itemId: number) => {
    setSelectedPrescriptionItems((prev) => prev.filter((it) => it.item_id !== itemId));
  };

  const handleUpdateItemDosage = (itemId: number, notes: string) => {
    setSelectedPrescriptionItems((prev) =>
      prev.map((it) => (it.item_id === itemId ? { ...it, dosage_notes: notes } : it))
    );
  };

  const handleUpdateItemQty = (itemId: number, qty: number) => {
    setSelectedPrescriptionItems((prev) =>
      prev.map((it) => (it.item_id === itemId ? { ...it, quantity: Math.max(1, qty) } : it))
    );
  };

  const handleLoadPrescriptionToCartClick = () => {
    if (!selectedPatient || !selectedPrescriptionItems.length) return;
    const cartItems = selectedPrescriptionItems.map((it) => ({
      item_id: it.item_id,
      item_name: it.item_name_ar ? `${it.item_name_ar} (${it.item_name_en || ''})` : it.item_name_en || `صنف #${it.item_id}`,
      unit_price: it.consumer_price || 0,
      quantity: it.quantity || 1
    }));
    playBeepSuccess();
    onLoadPrescriptionToCart(cartItems, selectedPatient);
    onClose();
  };

  // Insurance actions
  const handleSaveNewProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProviderName.trim()) return;
    try {
      if (window.electronAPI) {
        await window.electronAPI.saveInsuranceProvider({
          provider_name: newProviderName.trim(),
          default_copay_pct: newProviderCopay,
          contact_phone: newProviderPhone.trim(),
          is_active: 1
        });
        playBeepSuccess();
        setIsAddingProvider(false);
        setNewProviderName('');
        await loadInsuranceData();
      }
    } catch (err) {
      console.error('Failed to save provider:', err);
    }
  };

  const handleRecordSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProviderForSettle) return;
    const amt = parseFloat(settleAmount);
    if (!amt || amt <= 0) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.recordInsuranceSettlement(
          selectedProviderForSettle.provider_id,
          amt,
          settleNotes
        );
        playBeepSuccess();
        setSelectedProviderForSettle(null);
        setSettleAmount('');
        setSettleNotes('');
        await loadInsuranceData();
      }
    } catch (err) {
      console.error('Settlement error:', err);
      alert('خطأ في تسجيل السداد: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col h-[88vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                الرعاية السريرية: المرضى المزمنين وتعاقدات التأمين الطبي (F8)
              </h3>
              <p className="text-xs text-slate-500 font-sans">
                إدارة الروشتات الشهرية الثابتة، تنبيهات مواعيد الصرف، وذمم ومطالبات شركات التأمين
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('PATIENTS')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'PATIENTS'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HeartPulse className="w-3.5 h-3.5" />
                <span>المرضى المزمنين ({patients.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('INSURANCE')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'INSURANCE'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>شركات التأمين والمطالبات ({providers.length})</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab 1: Chronic Patients */}
        {activeTab === 'PATIENTS' && (
          <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
            {/* Left Column: Patient List (col-span-4) */}
            <div className="col-span-4 border-l border-slate-200 flex flex-col bg-slate-50/50">
              <div className="p-3 border-b border-slate-200 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (window.electronAPI) {
                        window.electronAPI.getChronicPatients(e.target.value).then(setPatients);
                      }
                    }}
                    placeholder="بحث باسم المريض أو الهاتف..."
                    className="w-full pl-3 pr-9 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:border-rose-500 focus:outline-hidden"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleStartNewPatient}
                  className="w-full py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة مريض مزمن جديد</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {patients.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    لا يوجد مرضى مزمنين مسجلين
                  </div>
                ) : (
                  patients.map((p) => {
                    const isSelected = selectedPatient?.patient_id === p.patient_id;
                    const itemsCount = p.items?.length || 0;
                    return (
                      <div
                        key={p.patient_id}
                        onClick={() => handleSelectPatient(p)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-200 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {p.patient_name}
                          </h4>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 font-semibold">
                            {itemsCount} أدوية
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                          {p.phone && (
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {p.phone}
                            </span>
                          )}
                          {p.conditions && (
                            <span className="truncate max-w-[120px] text-rose-600 font-medium">
                              • {p.conditions}
                            </span>
                          )}
                        </div>
                        {p.next_due_date && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-500" />
                            <span>الصرف القادم: </span>
                            <span className="font-mono font-semibold text-slate-600">
                              {p.next_due_date}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Details & Prescription Editor (col-span-8) */}
            <div className="col-span-8 flex flex-col bg-white overflow-hidden">
              {isEditingPatient || (!selectedPatient && patients.length === 0) ? (
                /* Patient Form Editor */
                <form onSubmit={handleSavePatient} className="flex-1 flex flex-col p-6 overflow-y-auto space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <h4 className="text-sm font-bold text-slate-800">
                      {selectedPatient ? 'تعديل ملف المريض المزمن' : 'تسجيل مريض مزمن جديد'}
                    </h4>
                    {selectedPatient && (
                      <button
                        type="button"
                        onClick={() => setIsEditingPatient(false)}
                        className="text-xs text-slate-500 hover:text-slate-800"
                      >
                        إلغاء التعديل
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        اسم المريض *
                      </label>
                      <input
                        type="text"
                        required
                        value={patientForm.patient_name}
                        onChange={(e) =>
                          setPatientForm({ ...patientForm, patient_name: e.target.value })
                        }
                        placeholder="الاسم ثلاثي أو ثنائي"
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:border-rose-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        رقم الهاتف / الواتساب
                      </label>
                      <input
                        type="text"
                        value={patientForm.phone || ''}
                        onChange={(e) =>
                          setPatientForm({ ...patientForm, phone: e.target.value })
                        }
                        placeholder="010xxxxxxxx"
                        className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl focus:border-rose-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        الحالات المرضية المزمنة
                      </label>
                      <input
                        type="text"
                        value={patientForm.conditions || ''}
                        onChange={(e) =>
                          setPatientForm({ ...patientForm, conditions: e.target.value })
                        }
                        placeholder="مثلاً: ضغط الدم، سكري النوع الثاني، قصور شرياني"
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:border-rose-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        دورة الصرف (بالأيام)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={patientForm.refill_interval_days || 30}
                        onChange={(e) =>
                          setPatientForm({
                            ...patientForm,
                            refill_interval_days: parseInt(e.target.value, 10) || 30
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl focus:border-rose-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ملاحظات أو توصيات الطبيب
                    </label>
                    <textarea
                      rows={2}
                      value={patientForm.notes || ''}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, notes: e.target.value })
                      }
                      placeholder="أي حساسيات دوائية أو مواعيد زيارة الطبيب..."
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:border-rose-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Prescription Item Selector in Form */}
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-2">
                      الأدوية الموصوفة في الروشتة الشهرية
                    </label>
                    <div className="relative mb-2">
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                      <input
                        type="text"
                        value={drugSearchQuery}
                        onChange={(e) => setDrugSearchQuery(e.target.value)}
                        placeholder="ابحث عن صنف لإضافته للروشتة..."
                        className="w-full pl-3 pr-9 py-1.5 text-xs border border-slate-300 rounded-xl focus:border-rose-500 focus:outline-hidden"
                      />
                      {drugSearchResults.length > 0 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {drugSearchResults.map((it) => (
                            <div
                              key={it.item_id}
                              onClick={() => handleAddDrugToPrescription(it)}
                              className="px-3 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs border-b border-slate-100 last:border-0"
                            >
                              <div>
                                <span className="font-bold text-slate-900">{it.item_name_en}</span>
                                <span className="text-slate-500 mr-2">({it.item_name_ar || 'بدون'})</span>
                              </div>
                              <span className="font-mono text-slate-700 font-bold">
                                {it.consumer_price.toFixed(2)} ج.م
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
                      {selectedPrescriptionItems.length === 0 ? (
                        <div className="py-4 text-center text-xs text-slate-400">
                          لم يتم تحديد أدوية بعد. ابحث في الحقل أعلاه لإدراج الأصناف.
                        </div>
                      ) : (
                        selectedPrescriptionItems.map((it) => (
                          <div key={it.item_id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                            <div className="flex-1">
                              <p className="font-bold text-slate-900">{it.item_name_en}</p>
                              <input
                                type="text"
                                value={it.dosage_notes || ''}
                                onChange={(e) => handleUpdateItemDosage(it.item_id, e.target.value)}
                                placeholder="جرعة الاستخدام (مثل: قرص بعد الإفطار)"
                                className="mt-1 w-full px-2 py-0.5 text-[11px] border border-slate-200 rounded-lg"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-slate-500">الكمية:</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={it.quantity || 1}
                                  onChange={(e) =>
                                    handleUpdateItemQty(it.item_id, parseInt(e.target.value, 10))
                                  }
                                  className="w-14 px-2 py-1 text-xs font-mono font-bold border border-slate-200 rounded-lg text-center"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemovePrescriptionItem(it.item_id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                    >
                      {loading ? 'جاري الحفظ...' : 'حفظ بيانات المريض'}
                    </button>
                  </div>
                </form>
              ) : selectedPatient ? (
                /* Patient Detail View */
                <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                  <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {selectedPatient.patient_name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        {selectedPatient.phone && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {selectedPatient.phone}
                          </span>
                        )}
                        {selectedPatient.conditions && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-[11px]">
                            {selectedPatient.conditions}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingPatient(true);
                          setPatientForm({
                            patient_name: selectedPatient.patient_name,
                            phone: selectedPatient.phone,
                            conditions: selectedPatient.conditions,
                            refill_interval_days: selectedPatient.refill_interval_days,
                            notes: selectedPatient.notes,
                            items: selectedPatient.items
                          });
                          setSelectedPrescriptionItems(selectedPatient.items || []);
                        }}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePatient(selectedPatient.patient_id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 cursor-pointer"
                        title="حذف الملف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Refill Status Indicators */}
                  <div className="grid grid-cols-3 gap-3 my-4">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500 block mb-0.5">
                        دورة الصرف المعتمدة
                      </span>
                      <span className="text-sm font-bold font-mono text-slate-800">
                        كل {selectedPatient.refill_interval_days} يوماً
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500 block mb-0.5">
                        آخر صرفية مسجلة
                      </span>
                      <span className="text-sm font-bold font-mono text-slate-800">
                        {selectedPatient.last_refill_date || 'لم تسجل بعد'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                      <span className="text-[11px] text-amber-700 block mb-0.5">
                        تاريخ الصرف القادم
                      </span>
                      <span className="text-sm font-bold font-mono text-amber-900">
                        {selectedPatient.next_due_date || 'غير محدد'}
                      </span>
                    </div>
                  </div>

                  {/* Prescription Items Table */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Pill className="w-4 h-4 text-rose-500" />
                        <span>الأدوية الموصوفة ({selectedPrescriptionItems.length} أصناف)</span>
                      </h4>
                      <span className="text-xs font-mono font-bold text-slate-700">
                        الإجمالي التقديري:{' '}
                        {selectedPrescriptionItems
                          .reduce((sum, it) => sum + (it.consumer_price || 0) * (it.quantity || 1), 0)
                          .toFixed(2)}{' '}
                        ج.م
                      </span>
                    </div>

                    <div className="flex-1 border border-slate-200 rounded-xl overflow-y-auto divide-y divide-slate-100">
                      {selectedPrescriptionItems.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          لا توجد أدوية مسجلة في روشتة هذا المريض
                        </div>
                      ) : (
                        selectedPrescriptionItems.map((it) => (
                          <div
                            key={it.item_id}
                            className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50"
                          >
                            <div className="min-w-0 flex-1">
                              <h5 className="font-bold text-slate-900 truncate">
                                {it.item_name_en}
                              </h5>
                              <p className="text-[11px] text-slate-500 truncate">
                                {it.item_name_ar || '—'}
                              </p>
                              {it.dosage_notes && (
                                <p className="text-[10px] text-rose-600 font-medium mt-0.5">
                                  الجرعة: {it.dosage_notes}
                                </p>
                              )}
                            </div>
                            <div className="text-left shrink-0 font-mono">
                              <div className="text-xs font-bold text-slate-900">
                                {((it.consumer_price || 0) * (it.quantity || 1)).toFixed(2)} ج.م
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {it.quantity} عبوة × {(it.consumer_price || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Action Bar: Load into Cart */}
                    <div className="pt-4 flex justify-between items-center">
                      <span className="text-xs text-slate-500">
                        الصرف سيحدث تاريخ الصرفية تلقائياً ويرحله للدورة القادمة
                      </span>
                      <button
                        type="button"
                        onClick={handleLoadPrescriptionToCartClick}
                        disabled={selectedPrescriptionItems.length === 0}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span>تحميل الروشتة في الكاشير وصرفها الآن</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
                  <HeartPulse className="w-12 h-12 mb-2 text-slate-300" />
                  <p>اختر مريضاً من القائمة الجانبية أو أضف مريضاً جديداً</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Insurance Providers & Claims */}
        {activeTab === 'INSURANCE' && (
          <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
            {/* Left Column: Insurance Providers List (col-span-4) */}
            <div className="col-span-4 border-l border-slate-200 flex flex-col bg-slate-50/50">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">الشركات والجهات المتعاقدة</span>
                <button
                  type="button"
                  onClick={() => setIsAddingProvider(true)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>شركة جديدة</span>
                </button>
              </div>

              {isAddingProvider && (
                <form onSubmit={handleSaveNewProvider} className="p-3 bg-blue-50 border-b border-blue-200 space-y-2 text-xs">
                  <input
                    type="text"
                    required
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    placeholder="اسم شركة التأمين أو النقابة..."
                    className="w-full px-2.5 py-1 text-xs border border-blue-300 rounded-lg bg-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newProviderCopay}
                      onChange={(e) => setNewProviderCopay(parseInt(e.target.value, 10) || 0)}
                      placeholder="نسبة تحمل العميل %"
                      className="w-full px-2 py-1 text-xs border border-blue-300 rounded-lg bg-white font-mono"
                    />
                    <input
                      type="text"
                      value={newProviderPhone}
                      onChange={(e) => setNewProviderPhone(e.target.value)}
                      placeholder="هاتف المطالبات"
                      className="w-full px-2 py-1 text-xs border border-blue-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingProvider(false)}
                      className="px-2 py-1 text-[11px] text-slate-600"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold"
                    >
                      حفظ
                    </button>
                  </div>
                </form>
              )}

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {providers.map((pr) => (
                  <div
                    key={pr.provider_id}
                    className="p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-300 transition-all flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {pr.provider_name}
                      </h4>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 font-bold">
                        تحمل {pr.default_copay_pct}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 block">المستحق على الشركة:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {pr.credit_balance.toFixed(2)} ج.م
                        </span>
                      </div>
                      {pr.credit_balance > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProviderForSettle(pr);
                            setSettleAmount(String(pr.credit_balance));
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
                        >
                          سداد دفعة
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Claims Table & Settlement Modal (col-span-8) */}
            <div className="col-span-8 flex flex-col bg-white overflow-hidden p-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold text-slate-800">
                    سجل مطالبات فواتير التأمين الطبي ({claims.length})
                  </h4>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500">الحالة:</span>
                  <select
                    value={claimsFilter}
                    onChange={(e) => setClaimsFilter(e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="ALL">جميع المطالبات</option>
                    <option value="PENDING">معلقة وغير مسددة</option>
                    <option value="PAID">مسددة بالكامل</option>
                  </select>
                </div>
              </div>

              {/* Settlement Sub-dialog */}
              {selectedProviderForSettle && (
                <div className="my-3 p-4 bg-emerald-50 border border-emerald-300 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-xs font-bold text-emerald-950">
                      سداد مطالبة شركة: {selectedProviderForSettle.provider_name}
                    </h5>
                    <button
                      type="button"
                      onClick={() => setSelectedProviderForSettle(null)}
                      className="text-emerald-700 hover:text-emerald-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <form onSubmit={handleRecordSettlementSubmit} className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-emerald-900 mb-0.5">
                        المبلغ المسدد (ج.م) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={settleAmount}
                        onChange={(e) => setSettleAmount(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs font-mono font-bold border border-emerald-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-emerald-900 mb-0.5">
                        رقم الشيك أو الملاحظات
                      </label>
                      <input
                        type="text"
                        value={settleNotes}
                        onChange={(e) => setSettleNotes(e.target.value)}
                        placeholder="تحويل بنكي أو شيك رقم..."
                        className="w-full px-2.5 py-1 text-xs border border-emerald-300 rounded-lg bg-white"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                      >
                        تأكيد السداد وترحيل القيد
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Claims Table */}
              <div className="flex-1 border border-slate-200 rounded-xl overflow-y-auto mt-2">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">رقم الفاتورة</th>
                      <th className="py-2 px-3">الشركة</th>
                      <th className="py-2 px-3">اسم المريض / الكارت</th>
                      <th className="py-2 px-3">إجمالي الفاتورة</th>
                      <th className="py-2 px-3">حصة المريض</th>
                      <th className="py-2 px-3">مطالبة الشركة</th>
                      <th className="py-2 px-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {claims.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          لا توجد مطالبات مسجلة في هذا النطاق
                        </td>
                      </tr>
                    ) : (
                      claims.map((c) => (
                        <tr key={c.claim_id} className="hover:bg-slate-50 font-mono">
                          <td className="py-2 px-3 font-bold text-slate-900">
                            #{c.invoice_id}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-800">
                            {c.provider_name}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-700">
                            <div>{c.patient_name || '—'}</div>
                            {c.patient_card_number && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {c.patient_card_number}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-900">
                            {c.total_invoice.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-emerald-700">
                            {c.patient_copay_amount.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 font-bold text-blue-700">
                            {c.company_claim_amount.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            {c.status === 'PAID' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                مسددة
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                معلقة
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            اختصار النافذة من الكاشير: <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-white border border-slate-300 rounded text-slate-700">F8</kbd>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            إغلاق (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
