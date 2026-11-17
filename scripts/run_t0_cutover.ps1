#Requires -Version 5.1
<#
  TITAN MODERN POS — ATOMIC T-0 CUTOVER SCRIPT (Workflow B: Direct On-PC)
  Enforces Anti-Split-Brain rule (blocks if Phye.exe or Modern POS is open),
  takes fresh T-0 read-only snapshot from D:\, runs Stages 1->4 ETL (~13s),
  enforces 5-Point Go-Live Gate, deploys to D:\Mariam_Elhomeily_Pharmacy_Data\pharmacy.sqlite,
  and configures storage-config.json automatically.
#>
$ErrorActionPreference = 'Stop'
$env:Path = "D:\Tools\node;$env:LOCALAPPDATA\Programs\Python\Python312;$env:LOCALAPPDATA\Programs\Python\Python312\Scripts;$env:Path"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "   TITAN MODERN POS - ATOMIC T-0 PRODUCTION CUTOVER (WORKFLOW B)" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

# 1. ANTI-SPLIT-BRAIN GUARD: Phye.exe MUST be closed!
$phye = Get-Process -Name "Phye" -ErrorAction SilentlyContinue
if ($phye) {
  Write-Host "`n[BLOCKED] Legacy Phye.exe is STILL RUNNING (PID: $($phye.Id -join ', '))!" -ForegroundColor Red
  Write-Host "Close Phye.exe first (after finishing the current customer and recording #N & Cash), then re-run this script." -ForegroundColor Yellow
  exit 1
}

$modern = Get-Process -Name "Mariam Elhomeily Pharmacy" -ErrorAction SilentlyContinue
if ($modern) {
  Write-Host "`n[BLOCKED] Mariam Elhomeily Pharmacy.exe is currently running! Close it before T-0 cutover." -ForegroundColor Red
  exit 1
}

$swTotal = [System.Diagnostics.Stopwatch]::StartNew()

# 2. FRESH T-0 READ-ONLY SNAPSHOT FROM D:\
Write-Host "`n[1/6] Taking fresh T-0 snapshot from D:\Labirdo\M-TITAN-11 + Everytime stock + titan.everyday ..." -ForegroundColor Cyan
$oldSys = "D:\Titan_Migration_Staging\old_sys"
New-Item -ItemType Directory -Path (Join-Path $oldSys "Labirdo\M-TITAN-11") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $oldSys "Everytime stock") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $oldSys "titan.everyday") -Force | Out-Null

& robocopy "D:\Labirdo\M-TITAN-11" (Join-Path $oldSys "Labirdo\M-TITAN-11") /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Snapshot M-TITAN-11 failed (exit $LASTEXITCODE)" }
& robocopy "D:\Everytime stock" (Join-Path $oldSys "Everytime stock") /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Snapshot Everytime stock failed (exit $LASTEXITCODE)" }
& robocopy "D:\titan.everyday" (Join-Path $oldSys "titan.everyday") /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Snapshot titan.everyday failed (exit $LASTEXITCODE)" }

# 3. STAGE 1: PYTHON EXTRACTION
Write-Host "`n[2/6] Stage 1: Extracting binary .phy/.ebw + CSV/XML -> SQLite ..." -ForegroundColor Cyan
& python D:\Titan_Migration_Staging\scripts\extract_titan_data.py
if ($LASTEXITCODE -ne 0) { throw "Stage 1 extraction failed!" }

$stageDb = "D:\Titan_Migration_Staging\pos\data\pharmacy.sqlite"
New-Item -ItemType Directory -Path (Split-Path $stageDb) -Force | Out-Null
Copy-Item "D:\Titan_Migration_Staging\titan_extracted.sqlite" $stageDb -Force
Remove-Item "$stageDb-wal","$stageDb-shm" -ErrorAction SilentlyContinue

Set-Location "D:\Titan_Migration_Staging\pos"

# 4. STAGE 2: STRIP/UNIT CALIBRATION
Write-Host "`n[3/6] Stage 2: Calibrating package_units (strips/units) ..." -ForegroundColor Cyan
& node scripts\auto_detect_package_units.mjs
if ($LASTEXITCODE -ne 0) { throw "Stage 2 package_units failed!" }

# 5. STAGE 3: GL DEDUP & RECONCILIATION
Write-Host "`n[4/6] Stage 3: Deduplicating GL & reconciling rounding ..." -ForegroundColor Cyan
& node scripts\fix_gl_duplicates.cjs
if ($LASTEXITCODE -ne 0) { throw "Stage 3 GL dedup failed!" }

# 6. STAGE 4: MODERN SCHEMA + FTS5 + 5-POINT GATE
Write-Host "`n[5/6] Stage 4: Modern schema upgrade, FTS5 rebuild & 5-Point Go-Live Gate ..." -ForegroundColor Cyan
& "D:\Titan_Migration_Staging\node_modules\.bin\tsx.cmd" -e "import { initDatabase, checkLedgerIntegrity, closeDatabase } from './src/main/db'; const db = initDatabase(); const ic = db.pragma('integrity_check'); const gl = checkLedgerIntegrity(); const maxSale = db.prepare('SELECT MAX(invoice_number) as m FROM sales_invoices').get(); const maxPur = db.prepare('SELECT MAX(purchase_invoice_id) as m FROM purchases_invoices').get(); const cash = db.prepare('SELECT cash_balance FROM treasury_state WHERE id=1').get(); const itemsCnt = db.prepare('SELECT COUNT(*) as c FROM items').get(); console.log('GATE_INTEGRITY:', ic); console.log('GATE_GL:', gl); console.log('GATE_STATS:', { items: itemsCnt.c, maxSalesInv: maxSale.m, maxPurchaseInv: maxPur.m, cashBalance: cash.cash_balance }); closeDatabase(); if (!gl.balanced || ic[0].integrity_check !== 'ok') process.exit(1);"
if ($LASTEXITCODE -ne 0) { throw "Stage 4 / Go-Live Gate FAILED!" }

# 7. DEPLOY TO PERMANENT PRODUCTION DATA FOLDER & UPDATE storage-config.json
Write-Host "`n[6/6] Deploying verified live DB to D:\Mariam_Elhomeily_Pharmacy_Data ..." -ForegroundColor Cyan
$prodDataDir = "D:\Mariam_Elhomeily_Pharmacy_Data"
$prodBackupDir = Join-Path $prodDataDir "backups"
$prodDb = Join-Path $prodDataDir "pharmacy.sqlite"
New-Item -ItemType Directory -Path $prodDataDir -Force | Out-Null
New-Item -ItemType Directory -Path $prodBackupDir -Force | Out-Null

# Backup any existing prod DB just in case
if (Test-Path $prodDb) {
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  Copy-Item $prodDb (Join-Path $prodBackupDir "pre_cutover_$ts.sqlite") -Force
}

Copy-Item $stageDb $prodDb -Force
Remove-Item "$prodDb-wal","$prodDb-shm" -ErrorAction SilentlyContinue

# Save backup copy to USB G:\ if connected
if (Test-Path "G:\") {
  $usbOut = "G:\fresh_production_db"
  New-Item -ItemType Directory -Path $usbOut -Force | Out-Null
  Copy-Item $prodDb (Join-Path $usbOut "pharmacy.sqlite") -Force
}

# Point storage-config.json to permanent production folder
$configJson = [ordered]@{
  dataDir = $prodDataDir
  configuredAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 2
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("D:\Mariam_Elhomeily_Pharmacy\storage-config.json", $configJson, $utf8NoBom)
$userDataDir = Join-Path $env:APPDATA "Mariam Elhomeily Pharmacy"
New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path $userDataDir "storage-config.json"), $configJson, $utf8NoBom)

$swTotal.Stop()
Write-Host "`n========================================================================" -ForegroundColor Green
Write-Host ("   ✅ T-0 CUTOVER COMPLETE IN {0:N1} SECONDS!" -f $swTotal.Elapsed.TotalSeconds) -ForegroundColor Green
Write-Host "   Production DB : $prodDb" -ForegroundColor Green
Write-Host "   Next Step     : Open 'صيدلية د. مريم الحميلي' -> Verify Header -> Open Shift #1 (F5)!" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
