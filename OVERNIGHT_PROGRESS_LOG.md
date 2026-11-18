# سجل التقدم الليلي لتنفيذ المزايا الـ 11 (Titan Modern POS Overnight Progress Log)

> يتم تحديث هذا الملف تلقائياً قبل وبعد كل ميزة عبر دورة `PRE -> DURING -> POST` المحددة في [`AGENTS.md`](file:///d:/pharmacy/titan_modern_pos/AGENTS.md) و[`FEATURE_WORKFLOW_PROTOCOL.md`](file:///d:/pharmacy/titan_modern_pos/FEATURE_WORKFLOW_PROTOCOL.md).

## 1. خط الأساس المؤمَّن (`#1989 Production Baseline`)
- **قاعدة البيانات المحمية:** [`data/pharmacy.sqlite`](file:///d:/pharmacy/titan_modern_pos/data/pharmacy.sqlite)
- **إجمالي الأصناف:** `18,704` صنفاً (`2,122` برصيد موجب، `5,053` بعبوات/شرائط مضبوطة)
- **رصيد الخزينة الافتتاحي:** `276,666.50 EGP`
- **الأستاذ العام (`general_ledger_2026`):** متزن عند `383,620.50 EGP` (فارق `0.00 EGP`)
- **حالة التجهيز:** البنية التحتية للوورك فلو (`gate:pre` / `gate:post` / `withSandboxDb`) جاهزة.

---

## 2. جدول متابعة الوحدات (`M1` – `M11`)

| الرمز | Sprint | اسم الميزة | الحالة | السكربت التحققي | توازن GL | Commit | وقت الانتهاء | ملاحظات |
| :--- | :---: | :--- | :---: | :--- | :---: | :--- | :--- | :--- |
| **M1** | S1 | RBAC Login & الدخول كمدير | ✅ DONE | `scripts/verify_m1.ts` | `0.00 EGP` | `feat(m1)` | 2026-11-18 02:18 | تنظيف `\x0f` وحذف `5..98` وتفعيل PIN + إخفاء الخزينة والربح عن الكاشير |
| **M2** | S1 | منظومة الموردين + مرتجع المشتريات والإكسباير | ✅ DONE | `scripts/verify_m2.ts` | `0.00 EGP` | `feat(m2)` | 2026-11-18 02:23 | سداد المورد + كشف حساب + مرتجع عادي وإكسباير بنسبة تعويض + شمول `.الكل` |
| **M3** | S1 | فك الحفظ وتعديل فواتير نفس اليوم | ✅ DONE | `scripts/verify_m3.ts` | `0.00 EGP` | `feat(m3)` | 2026-11-18 02:27 | التعديل في نفس اليوم بنفس `#N` + حارس الدرج + `invoice_revisions_log` |
| **M4** | S1 | التسعير الذكي + خصم % الربح + السعر المؤقت + حارس التكلفة | ✅ DONE | `scripts/verify_m4.ts` | `0.00 EGP` | `feat(m4)` | 2026-11-18 02:34 | `PROFIT_PCT` + حارس تحت التكلفة + `temp_price` + تغليف Sprint 1 |
| **M5** | S2 | طباعة ليبل الباركود الحراري Code-128 + تعدد الباركود | ✅ DONE | `scripts/verify_m5.ts` | `0.00 EGP` | `feat(m5)` | 2026-11-18 02:41 | Twin `38×12.5mm` (`TWIN_38x12`) + `item_barcodes` + جرد وطباعة المشتريات |
| **M6** | S2 | محرك البحث المتقدم بـ 9 طرق (`Ctrl+F`) | ✅ DONE | `scripts/verify_m6.ts` | `0.00 EGP` | `feat(m6)` | 2026-11-18 02:49 | `.685` / `AU*625` / `=OJMANTYN` / 3 Scopes |
| **M7** | S2 | استيراد فواتير Excel/CSV وتصدير التقارير الشامل | ⏳ PENDING | `scripts/verify_m7.ts` | — | — | — | + تغليف Sprint 2 (`package:dir` ← `F:\app`) |
| **M8** | S3 | النواقص الذكية + حد الطلب + معدل السحب وأفضل مورد | ⏳ PENDING | `scripts/verify_m8.ts` | — | — | — | `min_stock`/`max_stock` + ترشيح المخزن |
| **M9** | S3 | الجرد بالدولاب + مخاطر الإكسباير + دمج المكرر + مراقب السلامة | ⏳ PENDING | `scripts/verify_m9.ts` | — | — | — | + تغليف Sprint 3 (`package:dir` ← `F:\app`) |
| **M10** | S4 | المرضى المزمنين + التأمين + المثائل/البدائل + DDI | ⏳ PENDING | `scripts/verify_m10.ts` | — | — | — | `F8` + ذمم شركات التأمين + تكرار المادة |
| **M11** | S4 | الحضور بالباركود + البونص + صافي رأس المال الحي + إغلاق EOD | ⏳ PENDING | `scripts/verify_m11.ts` | — | — | — | + تغليف نهائي `dir portable nsis` ← `F:\` |

---

## 3. السجل الزمني للتنفيذ (`Chronological Execution Log`)
- `2026-11-18 02:03`: تجهيز البنية التحتية للوورك فلو (`AGENTS.md`, `titan-feature-workflow/SKILL.md`, `scripts/feature_gate.ts`, `scripts/lib/sandbox_db.ts`, `FEATURE_WORKFLOW_PROTOCOL.md`) في انتظار إشارة البدء.
- `2026-11-18 02:18`: إتمام **M1** واجتياز `gate:post -- M1` (`tsc --noEmit` + `npm run build` + `verify_m1.ts`, توازن GL `0.00 EGP`): شاشة الدخول والكارنيه، نافذة تفويض المدير، تنظيف حسابات `users` القديمة، وإخفاء الخزينة/الربح عن الكاشير.
- `2026-11-18 02:23`: إتمام **M2** واجتياز `gate:post -- M2` (`verify_m1.ts` + `verify_m2.ts`, توازن GL `0.00 EGP`): كشف حساب المورد، السداد النقدي، مرتجع المشتريات والإكسباير بنسبة تعويض وحساب هوالك متزن.
- `2026-11-18 02:27`: إتمام **M3** واجتياز `gate:post -- M3` (`verify_m1..m3.ts`, توازن GL `0.00 EGP`): فك الحفظ وتعديل فواتير نفس اليوم بنفس `#N` مع حارس النقدية وسجل المراجعات.
- `2026-11-18 02:34`: إتمام **M4** واجتياز `gate:post -- M4` (`verify_m1..m4.ts`, توازن GL `0.00 EGP`): محرك التسعير المشترك (`AMOUNT` / `TOTAL_PCT` / `PROFIT_PCT` / `WHOLESALE_COST`)، حارس البيع تحت التكلفة وتجاوز خصم الكاشير، والسعر المؤقت المزدوج + تغليف Sprint 1.
- `2026-11-18 02:41`: إتمام **M5** واجتياز `gate:post -- M5` (`verify_m1..m5.ts`, توازن GL `0.00 EGP`): مولّد Code-128 النقي (`src/shared/code128.ts`)، جدول الباركودات المتعددة `item_barcodes` وبحث الكاشير، ونافذة طباعة الملصق الحراري (`TWIN_38x12` و`SINGLE_38x25` و`SINGLE_50x25`) في المخزون والمشتريات.
- `2026-11-18 02:49`: إتمام **M6** واجتياز `gate:post -- M6` (`verify_m1..m6.ts`, توازن GL `0.00 EGP`): محرك البحث المتقدم بـ 9 طرق (`src/shared/phonetic.ts`, `advancedSearchItems`) الداعم للبحث الصوتي `=OJMANTYN`/`=AGMENTIN`، النجوم `AU*625`، نهاية الباركود `.1286`، الكود المختصر، النطاقات الثلاثة (`ALL`/`OUR_LIST`/`IN_STOCK`)، ونافذة `Ctrl+F` (`AdvancedDrugFinderModal.tsx`).
