---
name: titan-feature-workflow
description: >-
  Enforces the deterministic 3-stage PRE, DURING, and POST workflow for implementing
  modules M1 through M11 of Titan Modern POS from TITAN_11_MODULES_MASTER_PLAN.md.
  Use before starting any module, during feature implementation, or for unattended
  overnight /goal execution across all sprints.
---

# Titan Feature Workflow Runbook (`M1`–`M11`)

This skill guides isolated, regression-safe execution of each module in `d:\pharmacy\titan_modern_pos`.

## Quick Reference Per Module (`M<N>`)

### 1. BEFORE (`PRE-FEATURE`)
1. Run `npm run gate:pre -- M<N>`.
   - Seals the SHA-256 baseline of `data/pharmacy.sqlite` (`#1989` production snapshot) into `data/.baseline_db.sha256`.
   - Verifies clean git state on `data/pharmacy.sqlite`, sandbox clone integrity, `ensureSchemaUpgrades()` idempotency, and `0.00 EGP` GL balance.
2. Read the complete specification block for `### Module <N>:` inside `TITAN_11_MODULES_MASTER_PLAN.md`.
3. Update row `M<N>` in `OVERNIGHT_PROGRESS_LOG.md` to `🔄 IN_PROGRESS`.

### 2. DURING (`DURING-FEATURE`)
1. Implement **only** Module `M<N>` in this order:
   - Schema DDL (`ensureSchemaUpgrades()` in `src/main/db.ts`, idempotent).
   - Shared contracts & pure helpers (`src/shared/types.ts`, `src/shared/*.ts`).
   - Backend functions & atomic GL double-entry transactions (`src/main/db.ts`).
   - Electron main handlers & preload exposure (`src/main/index.ts`, `src/preload/index.ts`).
   - React views, modals, and hotkeys (`src/renderer/src/`).
2. Respect invariants:
   - Zero `'electron'` imports in `src/main/db.ts` or `src/shared/*`.
   - Aggregate supplier GL liabilities via `account_name LIKE 'خصوم.متداولة.موردين%'`.
   - Never touch `data/pharmacy.sqlite` directly.
3. Author `scripts/verify_m<N>.ts` using the canonical sandbox template below covering every requirement in section `(هـ)` of Module `M<N>`.

#### Canonical Template: `scripts/verify_m<N>.ts`
```ts
import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
// Import ONLY the module functions & helpers under test from '../src/main/db'

async function main() {
  console.log('=== VERIFY M<N>: <Module Name> ===');

  await withSandboxDb('m<N>', async (db) => {
    // 1. Assert DDL tables/columns created by ensureSchemaUpgrades()
    // 2. Assert legacy data edge cases / business rules for M<N>
    // 3. Assert role/guard negative cases reject with explicit errors
    // 4. Assert happy-path DB + financial state changes
    // Note: withSandboxDb automatically asserts 0.00 EGP GL balance,
    // second-boot ensureSchemaUpgrades() idempotency, sandbox cleanup,
    // and untouched live data/pharmacy.sqlite SHA-256.
  });

  console.log('[PASS] M<N> verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M<N> verification failed:', err);
  process.exit(1);
});
```

### 3. AFTER (`POST-FEATURE`)
1. Run `npm run gate:post -- M<N>`.
   - Verifies live DB hash untouched, headless purity, `npx tsc --noEmit`, `npm run build`, `scripts/verify_m<N>.ts`, and all prior regression suites `scripts/verify_m1..m<N-1>.ts`.
2. Update `OVERNIGHT_PROGRESS_LOG.md` row `M<N>` to `✅ DONE` and append an entry to the Chronological Execution Log.
3. Stage modified files (verify `data/pharmacy.sqlite` is untouched), commit as `feat(m<N>): <summary>`, and push `origin main` (log warning if offline overnight and continue).
4. If `F:\` is mounted:
   - `robocopy "d:\pharmacy\titan_modern_pos" "F:\Source_Code" /MIR /XD node_modules release dist dist-electron /R:2 /W:2 /NFL /NDL` (`$LASTEXITCODE -lt 8`).
   - `Copy-Item "d:\pharmacy\titan_modern_pos\OVERNIGHT_PROGRESS_LOG.md" "F:\OVERNIGHT_PROGRESS_LOG.md" -Force`
5. **Sprint & Final Packaging Checkpoints:**
   - On completion of `M4`, `M7`, and `M9`: run `npm run package:dir` and sync `release\win-unpacked` -> `F:\app` when `F:\` is mounted.
   - On completion of `M11`: run `npx electron-builder --win dir portable nsis` and copy updated artifacts to `F:\app`, `F:\Mariam_Elhomeily_Pharmacy_Portable.exe`, `F:\Mariam_Elhomeily_Pharmacy_Setup.exe`, and `F:\تثبيت_صيدلية_د_مريم_الحميلي.exe`.
