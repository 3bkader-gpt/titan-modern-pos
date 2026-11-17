import { app, dialog, shell, BrowserWindow } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { StorageInfo, ChangeDataDirResult } from '../shared/types';
import {
  getDatabaseInstance,
  getActiveDatabasePath,
  switchDatabase,
  checkLedgerIntegrity
} from './db';

interface StorageConfigFile {
  dataDir: string;
  configuredAt: string;
}

const CONFIG_FILE_NAME = 'storage-config.json';
const DB_FILE_NAME = 'pharmacy.sqlite';

function getPrimaryConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

function getBootstrapConfigPath(): string {
  return path.join(path.dirname(process.execPath), CONFIG_FILE_NAME);
}

function readConfigJson(filePath: string): StorageConfigFile | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StorageConfigFile>;
    if (parsed && typeof parsed.dataDir === 'string' && parsed.dataDir.trim().length > 0) {
      return {
        dataDir: path.resolve(parsed.dataDir.trim()),
        configuredAt: parsed.configuredAt || new Date().toISOString()
      };
    }
  } catch {
    // Ignore malformed JSON config
  }
  return null;
}

export function writeStorageConfig(dataDir: string): void {
  const payload: StorageConfigFile = {
    dataDir: path.resolve(dataDir),
    configuredAt: new Date().toISOString()
  };
  const primaryPath = getPrimaryConfigPath();
  fs.mkdirSync(path.dirname(primaryPath), { recursive: true });
  fs.writeFileSync(primaryPath, JSON.stringify(payload, null, 2), 'utf-8');
}

export function readStorageConfig(): StorageConfigFile | null {
  const primaryPath = getPrimaryConfigPath();
  const primaryCfg = readConfigJson(primaryPath);
  if (primaryCfg) {
    return primaryCfg;
  }

  if (app.isPackaged) {
    const bootstrapPath = getBootstrapConfigPath();
    const bootstrapCfg = readConfigJson(bootstrapPath);
    if (bootstrapCfg) {
      try {
        writeStorageConfig(bootstrapCfg.dataDir);
      } catch {
        // Non-fatal if primary write fails
      }
      return bootstrapCfg;
    }
  }

  return null;
}

function findSeedDatabasePath(): string | null {
  const candidates = [
    process.env.PORTABLE_EXECUTABLE_DIR
      ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data', DB_FILE_NAME)
      : '',
    path.join(path.dirname(process.execPath), 'data', DB_FILE_NAME),
    process.resourcesPath ? path.join(process.resourcesPath, 'data', DB_FILE_NAME) : '',
    path.resolve(process.cwd(), 'data', DB_FILE_NAME)
  ].filter(Boolean);

  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand) && fs.statSync(cand).size > 0) {
        return cand;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function isUnderDirectory(targetPath: string, parentDir: string | undefined): boolean {
  if (!parentDir) return false;
  const normTarget = path.resolve(targetPath).toLowerCase();
  const normParent = path.resolve(parentDir).toLowerCase();
  return normTarget === normParent || normTarget.startsWith(normParent + path.sep);
}

function isProtectedSystemDirectory(dirPath: string, rejectTempAndPrograms: boolean): boolean {
  const blockedDirs: Array<string | undefined> = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.SystemRoot
  ];

  if (rejectTempAndPrograms) {
    blockedDirs.push(os.tmpdir());
    if (process.env.LOCALAPPDATA) {
      blockedDirs.push(path.join(process.env.LOCALAPPDATA, 'Programs'));
    }
  }

  return blockedDirs.some((blocked) => isUnderDirectory(dirPath, blocked));
}

function probeDirectoryWritable(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probeFile = path.join(dirPath, `.titan_write_probe_${process.pid}_${Date.now()}`);
    fs.writeFileSync(probeFile, 'ok', 'utf-8');
    fs.unlinkSync(probeFile);
    return true;
  } catch {
    return false;
  }
}

export function isDirectoryWritableAndPersistent(dirPath: string): boolean {
  if (isProtectedSystemDirectory(dirPath, true)) {
    return false;
  }
  return probeDirectoryWritable(dirPath);
}

function copySeedDatabaseTo(targetDbPath: string): void {
  const seedPath = findSeedDatabasePath();
  if (!seedPath) {
    throw new Error('لم يتم العثور على نسخة قاعدة البيانات الأولية المدمجة مع البرنامج.');
  }
  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
  fs.copyFileSync(seedPath, targetDbPath);
}

function removeStaleWalFiles(dbFilePath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const walPath = `${dbFilePath}${suffix}`;
    try {
      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
      }
    } catch {
      // Ignore if locked or missing
    }
  }
}

function ensureBackupsDir(dataDir: string): string {
  const backupsDir = path.join(dataDir, 'backups');
  try {
    fs.mkdirSync(backupsDir, { recursive: true });
  } catch {
    // Best effort
  }
  return backupsDir;
}

export function resolveStartupDatabasePath(): { dbPath: string; isCustomConfigured: boolean } {
  const cfg = readStorageConfig();

  // Case A: User or installer previously configured a data folder
  if (cfg?.dataDir) {
    const targetDb = path.join(cfg.dataDir, DB_FILE_NAME);
    if (fs.existsSync(targetDb)) {
      ensureBackupsDir(cfg.dataDir);
      return { dbPath: targetDb, isCustomConfigured: true };
    }

    const rootDir = path.parse(cfg.dataDir).root;
    if (rootDir && fs.existsSync(rootDir) && isDirectoryWritableAndPersistent(cfg.dataDir)) {
      copySeedDatabaseTo(targetDb);
      ensureBackupsDir(cfg.dataDir);
      return { dbPath: targetDb, isCustomConfigured: true };
    }

    // Configured drive/path is unreachable (e.g. disconnected external disk)
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'مجلد قاعدة البيانات غير متاح حالياً',
      message: 'تعذر الوصول إلى مجلد حفظ البيانات المخصص:',
      detail: `${cfg.dataDir}\n\nقد يكون القرص غير متصل أو تم تغيير مكانه. ماذا تريد أن تفعل؟`,
      buttons: ['اختيار مجلد آخر الآن', 'استخدام المسار الاحتياطي مؤقتاً'],
      defaultId: 0,
      cancelId: 1
    });

    if (choice === 0) {
      const picked = dialog.showOpenDialogSync({
        title: 'اختر مجلد حفظ قاعدة البيانات',
        buttonLabel: 'اختيار هذا المجلد',
        properties: ['openDirectory', 'createDirectory']
      });
      if (picked && picked.length > 0) {
        const chosenDir = path.resolve(picked[0]);
        if (!isProtectedSystemDirectory(chosenDir, false) && probeDirectoryWritable(chosenDir)) {
          const newTargetDb = path.join(chosenDir, DB_FILE_NAME);
          if (!fs.existsSync(newTargetDb)) {
            copySeedDatabaseTo(newTargetDb);
          }
          writeStorageConfig(chosenDir);
          ensureBackupsDir(chosenDir);
          return { dbPath: newTargetDb, isCustomConfigured: true };
        }
      }
    }
  }

  // Case B: Development mode
  if (!app.isPackaged) {
    const devDb = path.resolve(process.cwd(), 'data', DB_FILE_NAME);
    ensureBackupsDir(path.dirname(devDb));
    return { dbPath: devDb, isCustomConfigured: true };
  }

  // Case C: Portable executable running next to a persistent folder
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const portableDataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
    if (isDirectoryWritableAndPersistent(portableDataDir)) {
      const portableDb = path.join(portableDataDir, DB_FILE_NAME);
      if (!fs.existsSync(portableDb)) {
        copySeedDatabaseTo(portableDb);
      }
      ensureBackupsDir(portableDataDir);
      return { dbPath: portableDb, isCustomConfigured: false };
    }
  }

  // Case D: Unpacked standalone folder with local data/pharmacy.sqlite outside Program Files
  const localDataDir = path.join(path.dirname(process.execPath), 'data');
  const localDb = path.join(localDataDir, DB_FILE_NAME);
  if (fs.existsSync(localDb) && isDirectoryWritableAndPersistent(localDataDir)) {
    ensureBackupsDir(localDataDir);
    return { dbPath: localDb, isCustomConfigured: false };
  }

  // Case E: Safe userData fallback (standard Windows per-user install / NSIS Setup)
  const userDataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(userDataDir, { recursive: true });
  const userDb = path.join(userDataDir, DB_FILE_NAME);
  if (!fs.existsSync(userDb)) {
    copySeedDatabaseTo(userDb);
  }
  ensureBackupsDir(userDataDir);
  return { dbPath: userDb, isCustomConfigured: false };
}

export function getStorageInfo(): StorageInfo {
  const activeDbPath = getActiveDatabasePath() || path.resolve(process.cwd(), 'data', DB_FILE_NAME);
  const dataDir = path.dirname(activeDbPath);
  const backupsDir = path.join(dataDir, 'backups');

  let dbSizeMB = 0;
  try {
    if (fs.existsSync(activeDbPath)) {
      dbSizeMB = Number((fs.statSync(activeDbPath).size / (1024 * 1024)).toFixed(2));
    }
  } catch {
    dbSizeMB = 0;
  }

  if (!app.isPackaged) {
    return {
      activeDbPath,
      dataDir,
      backupsDir,
      dbSizeMB,
      isCustomConfigured: true
    };
  }

  const cfg = readStorageConfig();
  const isCustomConfigured = Boolean(
    cfg?.dataDir && path.resolve(cfg.dataDir).toLowerCase() === path.resolve(dataDir).toLowerCase()
  );

  return {
    activeDbPath,
    dataDir,
    backupsDir,
    dbSizeMB,
    isCustomConfigured
  };
}

export function confirmCurrentDataDirectory(): StorageInfo {
  const currentInfo = getStorageInfo();
  ensureBackupsDir(currentInfo.dataDir);
  if (app.isPackaged || readStorageConfig()) {
    writeStorageConfig(currentInfo.dataDir);
  }
  return {
    ...currentInfo,
    isCustomConfigured: true
  };
}

export function openDataDirectoryInExplorer(): { success: boolean } {
  const currentInfo = getStorageInfo();
  if (fs.existsSync(currentInfo.activeDbPath)) {
    shell.showItemInFolder(currentInfo.activeDbPath);
    return { success: true };
  }
  if (fs.existsSync(currentInfo.dataDir)) {
    void shell.openPath(currentInfo.dataDir);
    return { success: true };
  }
  return { success: false };
}

export async function chooseAndMoveDataDirectory(
  parentWindow: BrowserWindow | null
): Promise<ChangeDataDirResult> {
  const openOpts: Electron.OpenDialogOptions = {
    title: 'اختر المجلد المخصص لحفظ قاعدة بيانات الصيدلية والنسخ الاحتياطية',
    buttonLabel: 'اختيار هذا المجلد',
    properties: ['openDirectory', 'createDirectory']
  };

  const selection = parentWindow
    ? await dialog.showOpenDialog(parentWindow, openOpts)
    : await dialog.showOpenDialog(openOpts);

  if (selection.canceled || selection.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const chosenDir = path.resolve(selection.filePaths[0]);

  if (isProtectedSystemDirectory(chosenDir, false)) {
    return {
      success: false,
      message: 'لا يمكن حفظ قاعدة البيانات داخل مجلدات النظام (Program Files أو Windows). يرجى اختيار مجلد على بارتيشن مثل D:\\ أو في مجلد المستندات.'
    };
  }

  if (!probeDirectoryWritable(chosenDir)) {
    return {
      success: false,
      message: `المجلد المختار لا يقبل الكتابة أو محمي ضد التعديل: ${chosenDir}`
    };
  }

  const targetDbPath = path.join(chosenDir, DB_FILE_NAME);
  const currentActiveDb = getActiveDatabasePath();

  if (
    currentActiveDb &&
    path.resolve(targetDbPath).toLowerCase() === path.resolve(currentActiveDb).toLowerCase()
  ) {
    const backupsDir = ensureBackupsDir(chosenDir);
    writeStorageConfig(chosenDir);
    return {
      success: true,
      mode: 'confirmed_current',
      activeDbPath: targetDbPath,
      dataDir: chosenDir,
      backupsDir,
      message: 'تم تأكيد مجلد حفظ البيانات الحالي بنجاح.'
    };
  }

  if (fs.existsSync(targetDbPath)) {
    const msgOpts: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'تم العثور على قاعدة بيانات موجودة',
      message: 'يوجد بالفعل ملف قاعدة بيانات (pharmacy.sqlite) في المجلد الذي اخترته:',
      detail: `${targetDbPath}\n\nكيف تود المتابعة؟`,
      buttons: [
        'نقل بياناتي الحالية إلى هذا المجلد (مع حفظ نسخة احتياطية للملف الموجود)',
        'فتح واستخدام قاعدة البيانات الموجودة في هذا المجلد',
        'إلغاء'
      ],
      defaultId: 0,
      cancelId: 2
    };

    const msgResult = parentWindow
      ? await dialog.showMessageBox(parentWindow, msgOpts)
      : await dialog.showMessageBox(msgOpts);

    if (msgResult.response === 2) {
      return { success: false, canceled: true };
    }

    if (msgResult.response === 1) {
      const previousDb = currentActiveDb;
      try {
        switchDatabase(targetDbPath);
        checkLedgerIntegrity();
        const backupsDir = ensureBackupsDir(chosenDir);
        writeStorageConfig(chosenDir);
        return {
          success: true,
          mode: 'attached_existing',
          activeDbPath: targetDbPath,
          dataDir: chosenDir,
          backupsDir,
          message: 'تم الربط بقاعدة البيانات الموجودة في المجلد المختار بنجاح.'
        };
      } catch (err: unknown) {
        if (previousDb && fs.existsSync(previousDb)) {
          try {
            switchDatabase(previousDb);
          } catch {
            // Best effort restore
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `تعذر فتح قاعدة البيانات المختارة أو أنها غير متوافقة: ${msg}`
        };
      }
    }

    // response === 0: archive existing file before overwriting with current live DB
    const previousBackupName = `pharmacy_previous_${Date.now()}.sqlite`;
    fs.renameSync(targetDbPath, path.join(chosenDir, previousBackupName));
    removeStaleWalFiles(targetDbPath);
  }

  // Atomic SQLite Online Backup migration to target directory
  try {
    const currentDb = getDatabaseInstance();
    await currentDb.backup(targetDbPath);

    if (!fs.existsSync(targetDbPath) || fs.statSync(targetDbPath).size === 0) {
      throw new Error('فشل التحقق من حجم ملف قاعدة البيانات بعد النسخ.');
    }

    removeStaleWalFiles(targetDbPath);
    const backupsDir = ensureBackupsDir(chosenDir);
    switchDatabase(targetDbPath);
    writeStorageConfig(chosenDir);

    return {
      success: true,
      mode: 'migrated',
      activeDbPath: targetDbPath,
      dataDir: chosenDir,
      backupsDir,
      message: 'تم نقل قاعدة البيانات واعتماد المجلد الجديد بنجاح.'
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `حدث خطأ أثناء نقل قاعدة البيانات: ${msg}`
    };
  }
}
