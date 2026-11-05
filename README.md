# Titan Modern POS (نظام إدارة الصيدليات ونقاط البيع المتطور)

نظام حديث ومتكامل لإدارة الصيدليات ونقاط البيع السريعة، مبني باستخدام **Electron** و **React** و **TypeScript** و **TailwindCSS** وقاعدة بيانات **SQLite (better-sqlite3)** فائقة السرعة.

---

## 🌟 المميزات الرئيسية

- **نقطة بيع سريعة (Fast POS):**
  - دعم البيع بالعبوة والشريط (Sub-units).
  - دعم قراءة الباركود، والبحث اللحظي فائق السرعة عبر محرك Full-Text Search (FTS).
  - بدائل ومثائل الأدوية بنفس المادة الفعالة.
  - دعم الدفع النقدي، والفيزا، والمبيعات الآجلة، والدليفري.
  - شورت كتس سريعة للوحة المفاتيح (F1-F12).

- **نظام المرتجعات المالي المحمي (Bulletproof Sales Returns):**
  - منع إرجاع أصناف غير مباعة أو كميات تتجاوز الفاتورة.
  - رد المبالغ بدقة حسب طريقة الدفع الأصلية (الآجل يُخصم من مديونية العميل، الفيزا تسجل بنكياً، الكاش يُخصم من الخزينة).
  - احتساب نسب الخصم الإجمالية للفاتورة بالتناسب على كل صنف.

- **دفتر أستاذ عام وقيد مزدوج (Double-Entry General Ledger):**
  - قيود متوازنة بدقة السنتيم بين الحسابات المدينة والدائنة.
  - فحص آلي لسلامة وتوازن الأستاذ العام (`checkLedgerIntegrity`).

- **إدارة الورديات والخزينة (Work Shifts & Treasury):**
  - حساب الكاش الفعلي المتوقع بدقة توقيت دقيقة، مع حساب العجز والزيادة.
  - رصد التدفقات النقدية اليومية الداخلة والخارجة.

- **إدارة المخزون والمشتريات (Inventory & Purchasing):**
  - قاعدة بيانات تضم أكثر من 18,500 صنف دواء مسجل.
  - احتساب بونص المشتريات على التكلفة الفعلية للوحدة.
  - سجل رقابي لجميع التعديلات اليدوية على المخزون (`inventory_adjustments_log`).
  - رصد تواريخ الصلاحية والنواقص التلقائية.

---

## 🛠 التقنيات المستخدمة (Tech Stack)

- **Runtime & Desktop:** [Electron](https://www.electronjs.org/)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [TailwindCSS v4](https://tailwindcss.com/), [Vite](https://vitejs.dev/)
- **Icons & Typography:** [Lucide React](https://lucide.dev/), Cairo & JetBrains Mono Fonts
- **Database Engine:** [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (WAL Mode, In-Memory Temp Store, 64MB Cache)
- **Bundler:** esbuild & Vite

---

## 🚀 التشغيل والتطوير (Getting Started)

### المتطلبات الأساسية
- [Node.js](https://nodejs.org/) (v18 فما فوق)
- npm

### 1. تثبيت الحزم (Install Dependencies)
```bash
npm install
```

### 2. تشغيل بيئة التطوير (Development Mode)
```bash
npm run dev
```

### 3. بناء النسخة الإنتاجية (Production Build)
```bash
npm run build
```

### 4. استخراج نسخة البورتابل المحمولة (Packaging Portable EXE)
```bash
npm run package:portable
```

---

## 🧪 الاختبارات والتحقق (Tests & Verification)

يحتوي المشروع على مجموعات اختبارات آلية للتحقق من سلامة الباك إند والمحاسبة:
```bash
# اختبارات نقاط البيع والمرتجعات
npx tsx scripts/verify_phase2.ts

# اختبارات التدقيق المحاسبي والثغرات المالية
npx tsx scripts/verify_audit_fixes.ts
```

---

## 📄 تقرير التدقيق المالي والأمني (Audit Report)
تم إجراء تدقيق مالي ومحاسبي كامل للنظام وإغلاق كافة الثغرات؛ للاطلاع على التقرير المفصل راجع:
[`audit_report.md`](./audit_report.md)

---

## 📜 الترخيص (License)
MIT License.
