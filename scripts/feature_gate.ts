import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  cleanupSandboxFiles,
  computeFileSha256,
  withSandboxDb
} from './lib/sandbox_db';

interface ModuleMeta {
  num: number;
  id: string;
  sprint: number;
  titleEn: string;
  titleAr: string;
}

const MODULES: ModuleMeta[] = [
  { num: 1, id: 'M1', sprint: 1, titleEn: 'RBAC Login & Manager Elevation', titleAr: 'نظام المستخدمين والصلاحيات والدخول كمدير' },
  { num: 2, id: 'M2', sprint: 1, titleEn: 'Full Supplier & Purchase Returns System', titleAr: 'منظومة الموردين الكاملة ومرتجعات المشتريات والإكسباير' },
  { num: 3, id: 'M3', sprint: 1, titleEn: 'Same-Day Unsave & Edit Invoice', titleAr: 'فك الحفظ وتعديل فواتير البيع في نفس اليوم' },
  { num: 4, id: 'M4', sprint: 1, titleEn: 'Smart Pricing, Profit-% Discount, Temp Price & Below-Cost Guard', titleAr: 'التسعير الذكي ونسبة الربح والسعر المؤقت وحارس التكلفة' },
  { num: 5, id: 'M5', sprint: 2, titleEn: 'Thermal Barcode Labels & Multi-Barcode', titleAr: 'طباعة ليبل الباركود الحراري وتعدد الباركود' },
  { num: 6, id: 'M6', sprint: 2, titleEn: '9-Method Advanced Drug Finder', titleAr: 'محرك البحث المتقدم بـ 9 طرق (Ctrl+F)' },
  { num: 7, id: 'M7', sprint: 2, titleEn: 'Excel/CSV Import & Universal Export', titleAr: 'استيراد فواتير المشتريات وتصدير التقارير الشامل' },
  { num: 8, id: 'M8', sprint: 3, titleEn: 'Smart Shortages, Velocity & Best Supplier', titleAr: 'النواقص الذكية وحد الطلب ومعدل السحب وأفضل مورد' },
  { num: 9, id: 'M9', sprint: 3, titleEn: 'Shelf Stocktake, Expiry Risk, Duplicate Merge & Integrity Monitor', titleAr: 'الجرد بالدولاب وتحليل الإكسباير ودمج المكرر ومراقب السلامة' },
  { num: 10, id: 'M10', sprint: 4, titleEn: 'Clinical, Chronic Refill, Insurance & DDI', titleAr: 'المرضى المزمنين وشركات التأمين والمثائل والبدائل والتداخلات' },
  { num: 11, id: 'M11', sprint: 4, titleEn: 'Staff Attendance, Incentives, Net Capital & EOD Closing', titleAr: 'شؤون العاملين والبونص وصافي رأس المال الحي وإغلاق اليوم' }
];

const REPO_ROOT = process.cwd();
const DATA_DIR = path.join(REPO_ROOT, 'data');
const LIVE_DB_PATH = path.join(DATA_DIR, 'pharmacy.sqlite');
const BASELINE_HASH_PATH = path.join(DATA_DIR, '.baseline_db.sha256');
const PROGRESS_LOG_PATH = path.join(REPO_ROOT, 'OVERNIGHT_PROGRESS_LOG.md');

function parseModuleArg(raw?: string): ModuleMeta {
  if (!raw) {
    throw new Error('Missing module identifier. Expected M1..M11 (e.g., M1).');
  }
  const normalized = raw.trim().toUpperCase();
  const match = normalized.match(/^M([1-9]|10|11)$/);
  if (!match) {
    throw new Error(`Invalid module identifier "${raw}". Expected M1..M11.`);
  }
  const num = Number(match[1]);
  const found = MODULES.find((m) => m.num === num);
  if (!found) {
    throw new Error(`Unknown module: ${normalized}`);
  }
  return found;
}

function runGit(args: string): string {
  return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function assertLiveDbClean(baselineHash?: string): string {
  if (!fs.existsSync(LIVE_DB_PATH)) {
    throw new Error(`Live database missing at: ${LIVE_DB_PATH}`);
  }
  const gitDirty = runGit('status --porcelain -- data/pharmacy.sqlite');
  if (gitDirty.length > 0) {
    throw new Error(
      `Live database has uncommitted git changes (${gitDirty}). Reset or inspect data/pharmacy.sqlite before running gate checks.`
    );
  }
  const currentHash = computeFileSha256(LIVE_DB_PATH);
  if (baselineHash && currentHash !== baselineHash) {
    throw new Error(
      `Live database SHA-256 mismatch! Expected ${baselineHash}, got ${currentHash}. Direct edits to data/pharmacy.sqlite are forbidden.`
    );
  }
  return currentHash;
}

function collectTsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function assertHeadlessDbPurity(): void {
  const electronImportRe = /from\s+['"]electron['"]|require\(\s*['"]electron['"]\s*\)/;
  const targets = [
    path.join(REPO_ROOT, 'src', 'main', 'db.ts'),
    ...collectTsFiles(path.join(REPO_ROOT, 'src', 'shared'))
  ];

  for (const filePath of targets) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Expected backend/shared file missing: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (electronImportRe.test(content)) {
      throw new Error(
        `Headless purity violation: "${path.relative(REPO_ROOT, filePath)}" imports "electron". Remove electron dependencies so Node/cutover scripts continue to work.`
      );
    }
  }
  console.log(`[PASS] Headless purity verified across ${targets.length} file(s) (no 'electron' imports in db.ts / src/shared).`);
}

function runTypeCheck(): void {
  console.log('[RUN] TypeScript strict check: npx tsc --noEmit');
  execSync('npx tsc --noEmit', { cwd: REPO_ROOT, stdio: 'inherit' });
  console.log('[PASS] TypeScript check succeeded with 0 errors.');
}

function runProductionBuild(): void {
  console.log('[RUN] Production bundle build: npm run build');
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' });
  console.log('[PASS] Production build succeeded.');
}

function getDoneModulesFromProgressLog(): Set<number> {
  const doneSet = new Set<number>();
  if (!fs.existsSync(PROGRESS_LOG_PATH)) {
    return doneSet;
  }
  const lines = fs.readFileSync(PROGRESS_LOG_PATH, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const rowMatch = line.match(/^\|\s*\*?\*?M(1[01]|[1-9])\*?\*?\s*\|.*\|/);
    if (rowMatch && line.includes('DONE')) {
      doneSet.add(Number(rowMatch[1]));
    }
  }
  return doneSet;
}

async function cmdPre(mod: ModuleMeta): Promise<void> {
  console.log(`=== PRE-FEATURE GATE: ${mod.id} (Sprint ${mod.sprint}) ===`);
  cleanupSandboxFiles(DATA_DIR);
  const hash = assertLiveDbClean();
  fs.writeFileSync(BASELINE_HASH_PATH, `${hash}\n`, 'utf8');

  const itemCount = await withSandboxDb(mod.id, (db) => {
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM items').get() as { cnt: number };
    if (!row || row.cnt <= 0) {
      throw new Error('Baseline sandbox items table is empty.');
    }
    return row.cnt;
  });

  assertLiveDbClean(hash);

  console.log('');
  console.log(`[PRE-GATE PASSED] ${mod.id}: ${mod.titleEn}`);
  console.log(`  Arabic Title  : ${mod.titleAr}`);
  console.log(`  Live DB Seal  : ${hash}`);
  console.log(`  Catalog Items : ${itemCount} | GL Integrity: 0.00 EGP`);
  console.log('');
  console.log(`DURING-FEATURE CHECKLIST FOR ${mod.id}:`);
  console.log(`  1. Read section "### Module ${mod.num}:" in TITAN_11_MODULES_MASTER_PLAN.md`);
  console.log(`  2. Mark ${mod.id} as IN_PROGRESS in OVERNIGHT_PROGRESS_LOG.md`);
  console.log(`  3. Implement ONLY ${mod.id} (DDL in ensureSchemaUpgrades -> types.ts -> db.ts -> main/preload -> UI)`);
  console.log(`  4. Keep src/main/db.ts & src/shared/* free of 'electron' imports and wrap financial writes in db.transaction()`);
  console.log(`  5. Write scripts/verify_m${mod.num}.ts using withSandboxDb('m${mod.num}', ...) covering all section (هـ) tests`);
  console.log(`  6. Run: npm run gate:post -- ${mod.id}`);
}

async function cmdPost(mod: ModuleMeta): Promise<void> {
  console.log(`=== POST-FEATURE GATE: ${mod.id} (Sprint ${mod.sprint}) ===`);
  cleanupSandboxFiles(DATA_DIR);

  const recordedHash = fs.existsSync(BASELINE_HASH_PATH)
    ? fs.readFileSync(BASELINE_HASH_PATH, 'utf8').trim()
    : undefined;
  const sealHash = assertLiveDbClean(recordedHash);
  console.log(`[PASS] Check 1: Live DB untouched (SHA-256: ${sealHash}).`);

  assertHeadlessDbPurity();
  runTypeCheck();
  runProductionBuild();

  const targetVerifyScript = path.join(REPO_ROOT, 'scripts', `verify_m${mod.num}.ts`);
  if (!fs.existsSync(targetVerifyScript)) {
    throw new Error(
      `Missing required verification script: ${path.relative(REPO_ROOT, targetVerifyScript)}`
    );
  }

  const doneModules = getDoneModulesFromProgressLog();
  for (let k = 1; k < mod.num; k++) {
    const prevScript = path.join(REPO_ROOT, 'scripts', `verify_m${k}.ts`);
    if (doneModules.has(k) && !fs.existsSync(prevScript)) {
      throw new Error(
        `Regression gap: M${k} is marked DONE in OVERNIGHT_PROGRESS_LOG.md, but scripts/verify_m${k}.ts is missing.`
      );
    }
  }

  const executedScripts: string[] = [];
  for (let k = 1; k <= mod.num; k++) {
    const scriptRel = path.join('scripts', `verify_m${k}.ts`);
    const scriptAbs = path.join(REPO_ROOT, scriptRel);
    if (fs.existsSync(scriptAbs)) {
      console.log(`[RUN] Module verification: npx tsx ${scriptRel}`);
      execSync(`npx tsx ${scriptRel}`, { cwd: REPO_ROOT, stdio: 'inherit' });
      executedScripts.push(scriptRel);
    }
  }
  console.log(`[PASS] Check 5: Executed ${executedScripts.length} verification suite(s): ${executedScripts.join(', ')}`);

  cleanupSandboxFiles(DATA_DIR);
  assertLiveDbClean(sealHash);
  console.log(`[PASS] Check 6: Live DB re-sealed cleanly after all verification suites.`);
  console.log('');
  console.log(
    `[POST-GATE PASSED] Module ${mod.id} verified cleanly! Next: update OVERNIGHT_PROGRESS_LOG.md -> git commit -> git push -> robocopy F:\\Source_Code`
  );
}

function cmdStatus(): void {
  const branch = runGit('rev-parse --abbrev-ref HEAD');
  const head = runGit('rev-parse --short HEAD');
  const dirtyDb = runGit('status --porcelain -- data/pharmacy.sqlite');
  const dbHash = fs.existsSync(LIVE_DB_PATH) ? computeFileSha256(LIVE_DB_PATH) : 'MISSING';
  const sealHash = fs.existsSync(BASELINE_HASH_PATH)
    ? fs.readFileSync(BASELINE_HASH_PATH, 'utf8').trim()
    : '(none)';
  const usbMounted = fs.existsSync('F:\\');

  const verifyScripts = MODULES.map((m) =>
    fs.existsSync(path.join(REPO_ROOT, 'scripts', `verify_m${m.num}.ts`)) ? m.id : null
  ).filter(Boolean);

  let doneCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;
  if (fs.existsSync(PROGRESS_LOG_PATH)) {
    const lines = fs.readFileSync(PROGRESS_LOG_PATH, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!/^\|\s*\*?\*?M(1[01]|[1-9])\*?\*?\s*\|/.test(line)) continue;
      if (line.includes('DONE')) doneCount++;
      else if (line.includes('IN_PROGRESS')) inProgressCount++;
      else pendingCount++;
    }
  }

  console.log('=== TITAN MODERN POS — WORKFLOW GATE STATUS ===');
  console.log(`Git Branch / HEAD  : ${branch} @ ${head}`);
  console.log(`Live DB Clean      : ${dirtyDb === '' ? 'YES' : `NO (${dirtyDb})`} | SHA-256: ${dbHash}`);
  console.log(`Baseline Seal File : ${sealHash}`);
  console.log(`USB F:\\ Mounted    : ${usbMounted ? 'YES' : 'NO'}`);
  console.log(`Verify Scripts     : ${verifyScripts.length > 0 ? verifyScripts.join(', ') : '(none yet)'}`);
  console.log(`Progress Log       : DONE=${doneCount}, IN_PROGRESS=${inProgressCount}, PENDING=${pendingCount}`);
}

async function cmdSelftest(): Promise<void> {
  console.log('=== WORKFLOW INFRASTRUCTURE SELFTEST ===');
  cleanupSandboxFiles(DATA_DIR);
  const beforeHash = assertLiveDbClean();

  const itemCount = await withSandboxDb('selftest', (db) => {
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM items').get() as { cnt: number };
    if (!row || row.cnt <= 0) {
      throw new Error('Selftest failed: items count <= 0');
    }
    return row.cnt;
  });
  console.log(`[PASS] Sandbox clone + double-boot idempotency + GL 0.00 EGP check verified (${itemCount} items).`);

  assertHeadlessDbPurity();
  runTypeCheck();
  assertLiveDbClean(beforeHash);
  console.log('[SELFTEST PASSED] All gate checks and live DB seal protection work correctly.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const command = (args[0] || '').toLowerCase();

  switch (command) {
    case 'pre':
      await cmdPre(parseModuleArg(args[1]));
      break;
    case 'post':
      await cmdPost(parseModuleArg(args[1]));
      break;
    case 'status':
      cmdStatus();
      break;
    case 'selftest':
      await cmdSelftest();
      break;
    default:
      console.error('Usage: tsx scripts/feature_gate.ts <pre|post|status|selftest> [M1..M11]');
      process.exit(1);
  }
}

main().catch((err) => {
  cleanupSandboxFiles(DATA_DIR);
  console.error(`\n[GATE FAILED] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
