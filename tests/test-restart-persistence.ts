process.env.NODE_ENV = 'test';

import http from 'http';
import mongoose from 'mongoose';
import { initializeApp } from '../src/app';
import { UserModel, TransactionModel } from '../src/models';

const PORT = 5097;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function request(options: { method: string; path: string; body?: any; token?: string; port?: number }): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const port = options.port || PORT;
    const url = new URL(options.path, `http://127.0.0.1:${port}`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Connection': 'close',
    };
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

    const req = http.request(url, { method: options.method, headers, agent: false }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 500, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode || 500, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function runRestartPersistenceTest() {
  console.log('🧪 Running Simulation: Server Restart & MongoDB Data Persistence...');

  const persistentEmail = `persist_${Date.now()}@apexbridge.com`;
  const persistentPassword = 'PersistentPass123!';

  // --- PHASE 1: Server Instance 1 ---
  console.log('\n[Phase 1] Starting initial server instance...');
  const app1 = await initializeApp();
  const server1 = await new Promise<http.Server>((resolve) => {
    const s = app1.listen(PORT, () => resolve(s));
  });

  console.log('[Phase 1] Signing up user...');
  const signupRes = await request({
    method: 'POST',
    path: '/api/v1/auth/signup',
    body: {
      fullName: 'Persistent Investor',
      email: persistentEmail,
      password: persistentPassword,
    },
  });
  assert(signupRes.status === 201, 'Signup on Server 1 failed');
  const userToken = signupRes.data.token;
  const userId = signupRes.data.user.id;

  console.log('[Phase 1] Adding deposit and adjusting balance to $45,000...');
  const depRes = await request({
    method: 'POST',
    path: '/api/v1/deposits',
    token: userToken,
    body: {
      method: 'btc',
      amount: 45000.0,
      currency: 'USD',
      transactionHash: '0xpersist_test_hash_001',
    },
  });
  assert(depRes.status === 201, 'Deposit on Server 1 failed');
  const depTxId = depRes.data.transaction.id;

  // Approve deposit to credit balance
  const approveRes = await request({
    method: 'PATCH',
    path: `/api/v1/admin/deposits/${depTxId}/status`,
    body: { status: 'approved' },
  });
  assert(approveRes.status === 200, 'Approve deposit on Server 1 failed');

  // Verify balance on Server 1
  const wallet1 = await request({ method: 'GET', path: '/api/v1/wallet/summary', token: userToken });
  assert(wallet1.data.data.availableBalance === 45000, `Expected balance 45000, got ${wallet1.data.data.availableBalance}`);
  console.log('✅ Phase 1 completed: User created, balance $45,000, transaction recorded.');

  // --- SIMULATING RENDER RESTART / REDEPLOY ---
  console.log('\n⚡ Simulating Server Crash / Render Redeploy (stopping Server 1)...');
  await new Promise<void>((resolve) => server1.close(() => resolve()));
  console.log('🛑 Server 1 stopped completely. RAM cleared.');

  const PORT_2 = 5096;
  // --- PHASE 2: Server Instance 2 (Simulating fresh container start) ---
  console.log('\n[Phase 2] Starting brand new server instance from cold start on port ' + PORT_2 + '...');
  const app2 = await initializeApp();
  const server2 = await new Promise<http.Server>((resolve) => {
    const s = app2.listen(PORT_2, () => resolve(s));
  });
  console.log('🚀 Server 2 running and listening.');

  console.log('[Phase 2] Logging in previously created user...');
  const loginRes = await request({
    method: 'POST',
    path: '/api/v1/auth/login',
    port: PORT_2,
    body: {
      email: persistentEmail,
      password: persistentPassword,
    },
  });
  assert(loginRes.status === 200 && loginRes.data.success === true, 'Login after restart failed!');
  assert(loginRes.data.user.id === userId, 'User ID matches across restarts');
  const newToken = loginRes.data.token;
  console.log('✅ User successfully logged in after server restart!');

  console.log('[Phase 2] Checking wallet balance across restart...');
  const wallet2 = await request({ method: 'GET', path: '/api/v1/wallet/summary', token: newToken, port: PORT_2 });
  assert(wallet2.data.data.availableBalance === 45000, `Expected balance $45,000 after restart, got ${wallet2.data.data.availableBalance}`);
  console.log(`✅ Balance preserved across server restart: $${wallet2.data.data.availableBalance} USD`);

  console.log('[Phase 2] Checking transactions history across restart...');
  const txRes = await request({ method: 'GET', path: '/api/v1/transactions', token: newToken, port: PORT_2 });
  assert(txRes.status === 200 && txRes.data.data.length >= 1, 'Transactions lost across restart!');
  const foundTx = txRes.data.data.find((t: any) => t.id === depTxId);
  assert(foundTx !== undefined, 'Specific deposit transaction preserved across restart');
  console.log(`✅ Transactions preserved across server restart (Found tx: ${depTxId})`);

  console.log('\n========================================================================');
  console.log('🎉 RESTART & PERSISTENCE VERIFICATION PASSED: 100% DATA INTEGRITY ON MONGODB!');
  console.log('========================================================================\n');

  await new Promise<void>((resolve) => server2.close(() => resolve()));
  await mongoose.disconnect();
  process.exit(0);
}

runRestartPersistenceTest().catch((err) => {
  console.error('❌ Restart persistence test failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
