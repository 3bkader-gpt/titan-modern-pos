# Titan Modern POS — Mandatory Per-Feature Execution Rules

Follow `TITAN_11_MODULES_MASTER_PLAN.md` strictly **one module at a time** in order (`M1` -> `M2` -> ... -> `M11`). Activate the `titan-feature-workflow` skill whenever executing modules or an overnight `/goal` run.

## Mandatory 3-Stage Loop Per Module (`M1`–`M11`)

### Stage 1 — BEFORE (`PRE-FEATURE`)
1. Run `npm run gate:pre -- M<N>`. Stop if it fails.
2. Read the exact specification under `### Module <N>:` in `TITAN_11_MODULES_MASTER_PLAN.md`.
3. Update `OVERNIGHT_PROGRESS_LOG.md` setting row `M<N>` to `IN_PROGRESS` (`🔄`).

### Stage 2 — DURING (`DURING-FEATURE`)
1. **Strict Scope:** Implement **ONLY** `M<N>` across:
   - `ensureSchemaUpgrades()` in `src/main/db.ts` using idempotent `CREATE TABLE IF NOT EXISTS` / safe `addColumnIfNotExists`
   - `src/shared/types.ts` (and pure shared helpers like `src/shared/*.ts`)
   - `src/main/db.ts` backend logic
   - `src/main/index.ts` and `src/preload/index.ts` IPC bridges
   - `src/renderer/src/*` UI views, components, and hotkeys
2. **Headless Backend Purity:** Never import `'electron'` inside `src/main/db.ts` or `src/shared/*` so CLI/cutover scripts (`run_t0_cutover.ps1`) continue working outside Electron.
3. **Transaction & Ledger Invariant:** Wrap every multi-table or financial write in `database.transaction(...)` and keep `general_ledger_2026` balanced at **`0.00 EGP`** (`SUM(debit) - SUM(credit) == 0.00`).
4. **Legacy Supplier Account Rule:** Aggregate supplier payables using `account_name LIKE 'خصوم.متداولة.موردين%'` to include legacy `'خصوم.متداولة.موردين.الكل'` entries.
5. **Live DB Protection & Verification Script:** **Never** write directly to `data/pharmacy.sqlite`. Create `scripts/verify_m<N>.ts` importing `withSandboxDb('m<N>', ...)` from `./lib/sandbox_db` covering every acceptance criterion in section `(هـ)` of Module `<N>`.

### Stage 3 — AFTER (`POST-FEATURE`)
1. Run `npm run gate:post -- M<N>`. Fix any error before moving on; **never** skip a failing check or relax assertions.
   - `gate:post` enforces: untouched `data/pharmacy.sqlite`, headless purity, `npx tsc --noEmit`, `npm run build`, `scripts/verify_m<N>.ts`, cumulative regression across all prior `verify_m1..m<N-1>.ts`, and sandbox cleanup.
2. Update `OVERNIGHT_PROGRESS_LOG.md` row `M<N>` to `✅ DONE` with timestamp, short commit info, and `0.00 EGP` GL status, plus append a summary bullet in the Chronological Log.
3. Verify `git status --porcelain -- data/pharmacy.sqlite` is empty, then create one atomic commit:
   `git commit -m "feat(m<N>): <concise summary>"`
   and run `git push origin main` (if network is unreachable overnight, log a warning in `OVERNIGHT_PROGRESS_LOG.md` and continue without halting).
4. If USB drive `F:\` is mounted:
   - Run `robocopy "d:\pharmacy\titan_modern_pos" "F:\Source_Code" /MIR /XD node_modules release dist dist-electron /R:2 /W:2 /NFL /NDL` (success if `$LASTEXITCODE -lt 8`).
   - Copy `OVERNIGHT_PROGRESS_LOG.md` to `F:\OVERNIGHT_PROGRESS_LOG.md`.
5. **Sprint & Final Packaging Rule:**
   - At Sprint boundaries **`M4`** (Sprint 1), **`M7`** (Sprint 2), and **`M9`** (Sprint 3): run `npm run package:dir`, and if `F:\` is mounted, mirror `release\win-unpacked` -> `F:\app`.
   - After **`M11`** completes: run `npx electron-builder --win dir portable nsis`, then update `F:\app`, `F:\Mariam_Elhomeily_Pharmacy_Portable.exe`, `F:\Mariam_Elhomeily_Pharmacy_Setup.exe`, and `F:\تثبيت_صيدلية_د_مريم_الحميلي.exe` when `F:\` is mounted.

## Hard Prohibitions
- **Never** run `git reset --hard`, `git push --force`, or batch multiple modules into one commit.
- **Never** commit modified `data/pharmacy.sqlite` or `*.sandbox.sqlite*`.
- **Never** delete or overwrite `F:\Migration_Scripts`, `F:\Antigravity_Setup`, `F:\Titandata`, `F:\Titan.guide`, or legacy Titan folders on `F:\`.
