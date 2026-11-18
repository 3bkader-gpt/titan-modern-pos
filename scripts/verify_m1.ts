import assert from 'node:assert/strict';
import { withSandboxDb } from './lib/sandbox_db';
import {
  listActiveUsers,
  authenticateUser,
  verifyManagerOverride,
  saveOrUpdateUserAccount,
  getLoginAuditLogs
} from '../src/main/db';

async function main() {
  console.log('=== VERIFY M1: RBAC Login, Manager Override & Legacy Users Cleanup ===');

  await withSandboxDb('m1', async (db) => {
    // 1. Verify legacy \x0f control chars removed and empty slots 5..98 deleted
    const dirtyUsers = db
      .prepare('SELECT user_id, user_name FROM users WHERE instr(user_name, char(15)) > 0')
      .all() as Array<{ user_id: number; user_name: string }>;
    assert.equal(dirtyUsers.length, 0, 'All \\x0f control characters must be stripped from users.user_name');

    const emptySlots = db
      .prepare("SELECT user_id FROM users WHERE user_id BETWEEN 5 AND 98 AND (user_name IS NULL OR TRIM(user_name) = '')")
      .all();
    assert.equal(emptySlots.length, 0, 'Empty legacy user slots 5..98 must be removed');

    // 2. Active users list should contain exact 4 active accounts (2, 3, 4, 99)
    const activeUsers = listActiveUsers();
    const activeIds = activeUsers.map((u) => u.user_id).sort((a, b) => a - b);
    assert.deepEqual(activeIds, [2, 3, 4, 99], `Expected active user IDs [2, 3, 4, 99], got ${JSON.stringify(activeIds)}`);
    assert.equal((activeUsers[0] as unknown as Record<string, unknown>).pin_code, undefined, 'listActiveUsers must never leak pin_code');

    // 3. Authenticate Cashier Esraa (#4, PIN 2222)
    const cashierSession = authenticateUser(4, '2222');
    assert.equal(cashierSession.user_id, 4);
    assert.equal(cashierSession.user_name, 'اسراء');
    assert.equal(cashierSession.role, 'CASHIER');
    assert.ok(!cashierSession.allowed_tabs.includes('treasury'), 'Cashier must NOT access treasury');
    assert.ok(!cashierSession.allowed_tabs.includes('reports'), 'Cashier must NOT access reports');

    // Authenticate Pharmacist Shorouk by badge barcode ('EMP-3', PIN 1111)
    const pharmSession = authenticateUser('EMP-3', '1111');
    assert.equal(pharmSession.user_id, 3);
    assert.equal(pharmSession.user_name, 'شروق');
    assert.equal(pharmSession.role, 'PHARMACIST');

    // 4. Failed PIN must throw and log FAILED_PIN
    assert.throws(() => authenticateUser(4, '0000'), /PIN|غير صحيح/);
    const auditAfterFail = getLoginAuditLogs(10);
    assert.ok(
      auditAfterFail.some((e) => e.user_id === 4 && e.action_type === 'FAILED_PIN'),
      'Expected FAILED_PIN entry in login_audit_log'
    );

    // 5. Manager Override ("الدخول كمدير") with wrong PIN fails; with 1989 succeeds and logs
    assert.throws(() => verifyManagerOverride('2222', 4, 'خصم خاص', 'INV-1'), /المدير/);
    const overrideRes = verifyManagerOverride('1989', 4, 'خصم خاص', 'INV-1');
    assert.equal(overrideRes.ok, true);
    assert.equal(overrideRes.managerId, 2);

    const auditAfterOverride = getLoginAuditLogs(10);
    assert.ok(
      auditAfterOverride.some(
        (e) =>
          e.user_id === 4 &&
          e.action_type === 'MANAGER_OVERRIDE' &&
          e.authorized_by_id === 2 &&
          e.target_ref.includes('INV-1')
      ),
      'Expected MANAGER_OVERRIDE audit entry linking requester #4 and manager #2'
    );

    // 6. Save/update user account works cleanly
    const created = saveOrUpdateUserAccount({
      user_name: 'د. أحمد تجريبي',
      pin_code: '5555',
      role: 'PHARMACIST'
    });
    assert.ok(created.user_id > 99);
    const createdSession = authenticateUser(created.user_id, '5555');
    assert.equal(createdSession.role, 'PHARMACIST');

    console.log(`[PASS] Active users verified: ${activeUsers.map((u) => `${u.user_name}(${u.role})`).join(', ')}`);
  });

  console.log('[PASS] M1 verification complete.');
}

main().catch((err) => {
  console.error('[FAIL] M1 verification failed:', err);
  process.exit(1);
});
