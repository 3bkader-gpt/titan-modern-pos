import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDatabaseInstance, getActiveDatabasePath } from './db';
import { BackupStatus, BackupStateCode } from '../shared/types';

const execAsync = promisify(exec);

let currentStatus: BackupStatus = {
  status: 'LOCAL_ONLY',
  message: 'نظام النسخ الاحتياطي في وضع الاستعداد'
};

let statusChangeCallback: ((status: BackupStatus) => void) | null = null;

export function onBackupStatusChanged(callback: (status: BackupStatus) => void) {
  statusChangeCallback = callback;
}

function updateStatus(newStatus: Partial<BackupStatus>) {
  currentStatus = { ...currentStatus, ...newStatus };
  if (statusChangeCallback) {
    statusChangeCallback(currentStatus);
  }
}

/**
 * Detects connected USB/Removable drives on Windows silently without any popups
 */
export async function detectUsbDrive(): Promise<string | null> {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    // DriveType = 2 corresponds to Removable Disk (USB Flash Drive)
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | Select-Object -ExpandProperty DeviceID"',
      { windowsHide: true, timeout: 5000 }
    );
    const driveLetters = stdout
      .split(/\r?\n/)
      .map(d => d.trim())
      .filter(d => /^[A-Z]:$/i.test(d));

    if (driveLetters.length > 0) {
      return driveLetters[0]; // e.g. "E:"
    }
  } catch {
    // Silent failover - no errors or interruptions
  }
  return null;
}

/**
 * Performs a non-blocking live backup using SQLite's Online Backup API
 */
export async function performBackup(): Promise<BackupStatus> {
  const db = getDatabaseInstance();
  const activeDbPath = getActiveDatabasePath();
  const baseDataDir = activeDbPath ? path.dirname(activeDbPath) : path.resolve(process.cwd(), 'data');
  const backupDir = path.join(baseDataDir, 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const localFileName = `pharmacy_backup_${timestamp}.sqlite`;
  const localFilePath = path.join(backupDir, localFileName);

  updateStatus({
    status: 'BACKING_UP',
    message: 'جاري إجراء النسخ الاحتياطي غير المعطل...'
  });

  try {
    // 1. Non-blocking SQLite native online backup
    await db.backup(localFilePath);

    const stats = fs.statSync(localFilePath);
    const sizeMB = Number((stats.size / (1024 * 1024)).toFixed(2));
    const formattedTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 2. Check for USB flash drive
    const usbDrive = await detectUsbDrive();

    if (usbDrive) {
      try {
        const usbBackupDir = path.join(`${usbDrive}\\`, 'titan_backups');
        if (!fs.existsSync(usbBackupDir)) {
          fs.mkdirSync(usbBackupDir, { recursive: true });
        }
        const usbDestFile = path.join(usbBackupDir, localFileName);
        fs.copyFileSync(localFilePath, usbDestFile);

        updateStatus({
          status: 'USB_CONNECTED',
          usbDrive,
          lastBackupTime: formattedTime,
          lastBackupFile: localFileName,
          backupSizeMB: sizeMB,
          message: `تم النسخ الاحتياطي بنجاح على الفلاشة (${usbDrive}) والمحلي (${sizeMB} MB)`
        });
        return currentStatus;
      } catch {
        // USB write error handled gracefully
      }
    }

    // Local only backup
    updateStatus({
      status: 'LOCAL_ONLY',
      lastBackupTime: formattedTime,
      lastBackupFile: localFileName,
      backupSizeMB: sizeMB,
      message: `تم النسخ الاحتياطي محلياً بنجاح (${sizeMB} MB) - لا توجد فلاشة متصلة`
    });

    return currentStatus;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    updateStatus({
      status: 'ERROR',
      message: `فشل النسخ الاحتياطي: ${errorMsg}`
    });
    return currentStatus;
  }
}

let usbWatcherTimer: ReturnType<typeof setInterval> | null = null;
let lastMountedDrivesSignature: string | null = null;

function getMountedDrivesSignature(): string {
  const letters: string[] = [];
  for (let code = 68; code <= 90; code++) { // D..Z
    const letter = String.fromCharCode(code);
    try {
      if (fs.existsSync(`${letter}:\\`)) {
        letters.push(letter);
      }
    } catch {
      // Ignore unready drive
    }
  }
  return letters.join(',');
}

/**
 * Background watcher to keep UI informed about USB status without periodic PowerShell spawning
 */
export function startUsbWatcher(intervalMs: number = 10000) {
  stopUsbWatcher();

  const check = async () => {
    if (currentStatus.status === 'BACKING_UP') return;
    const sig = getMountedDrivesSignature();
    if (sig === lastMountedDrivesSignature) {
      return;
    }
    lastMountedDrivesSignature = sig;

    const usb = await detectUsbDrive();
    if (usb && currentStatus.status !== 'USB_CONNECTED') {
      updateStatus({
        status: 'USB_CONNECTED',
        usbDrive: usb,
        message: `تم اكتشاف فلاشة USB متصلة (${usb}) - جاهز للنسخ المزدوج`
      });
    } else if (!usb && currentStatus.status === 'USB_CONNECTED') {
      updateStatus({
        status: 'LOCAL_ONLY',
        usbDrive: undefined,
        message: 'تم فصل الفلاشة - النسخ محلي فقط'
      });
    }
  };

  // Initial check
  void check();
  usbWatcherTimer = setInterval(() => {
    void check();
  }, intervalMs);
}

export function stopUsbWatcher() {
  if (usbWatcherTimer) {
    clearInterval(usbWatcherTimer);
    usbWatcherTimer = null;
  }
}

export function getCurrentBackupStatus(): BackupStatus {
  return currentStatus;
}
