import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  switchDatabase,
  closeDatabase,
  checkLedgerIntegrity
} from '../../src/main/db';

const SANDBOX_SUFFIXES = ['.sandbox.sqlite', '.sandbox.sqlite-wal', '.sandbox.sqlite-shm'];

/**
 * Compute hex SHA-256 checksum of a file on disk.
 */
export function computeFileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function unlinkIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function removeDbSet(dbPath: string): void {
  unlinkIfExists(dbPath);
  unlinkIfExists(`${dbPath}-wal`);
  unlinkIfExists(`${dbPath}-shm`);
}

/**
 * Close any open SQLite handle (releasing Windows WAL/SHM locks) and
 * remove all temporary *.sandbox.sqlite* files inside `dataDir`.
 */
export function cleanupSandboxFiles(dataDir: string): void {
  closeDatabase();
  if (!fs.existsSync(dataDir)) {
    return;
  }

  for (const entry of fs.readdirSync(dataDir)) {
    if (SANDBOX_SUFFIXES.some((suffix) => entry.endsWith(suffix))) {
      unlinkIfExists(path.join(dataDir, entry));
    }
  }
}

/**
 * Clone `data/pharmacy.sqlite` into a disposable sandbox file, run verification `fn`,
 * assert strict `0.00 EGP` GL balance before and after an idempotent second boot,
 * clean up sandbox artifacts, and verify the live #1989 database remained bit-identical.
 */
export async function withSandboxDb<T>(
  tag: string,
  fn: (db: ReturnType<typeof switchDatabase>, sandboxPath: string) => Promise<T> | T
): Promise<T> {
  const dataDir = path.resolve(process.cwd(), 'data');
  const liveDb = path.join(dataDir, 'pharmacy.sqlite');
  if (!fs.existsSync(liveDb)) {
    throw new Error(`Live database not found at: ${liveDb}`);
  }

  const safeTag = tag.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'sandbox';
  const sandboxPath = path.join(dataDir, `${safeTag}.sandbox.sqlite`);

  closeDatabase();
  const beforeHash = computeFileSha256(liveDb);
  removeDbSet(sandboxPath);
  fs.copyFileSync(liveDb, sandboxPath);

  try {
    const db = switchDatabase(sandboxPath);
    const result = await fn(db, sandboxPath);

    const gl1 = checkLedgerIntegrity(db);
    if (!gl1.balanced || Math.abs(gl1.diff) > 0.001) {
      throw new Error(
        `GL balance assertion failed after test "${tag}": ${gl1.message} (diff=${gl1.diff.toFixed(4)})`
      );
    }

    // Re-open the same sandbox DB to verify ensureSchemaUpgrades() is 100% idempotent.
    const db2 = switchDatabase(sandboxPath);
    const gl2 = checkLedgerIntegrity(db2);
    if (!gl2.balanced || Math.abs(gl2.diff) > 0.001) {
      throw new Error(
        `GL balance assertion failed on second boot "${tag}": ${gl2.message} (diff=${gl2.diff.toFixed(4)})`
      );
    }

    return result;
  } finally {
    closeDatabase();
    removeDbSet(sandboxPath);
    const afterHash = computeFileSha256(liveDb);
    if (afterHash !== beforeHash) {
      throw new Error(
        `CRITICAL: Live database ${liveDb} was modified during sandbox run "${tag}"! (${beforeHash} -> ${afterHash})`
      );
    }
  }
}
