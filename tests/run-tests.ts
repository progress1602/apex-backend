import http from 'http';
import { initializeApp } from '../src/app';

let server: http.Server;
const PORT = 5099;
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface RequestOptions {
  method: string;
  path: string;
  body?: any;
  token?: string;
}

async function request({ method, path, body, token }: RequestOptions): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const data = rawData.startsWith('{') || rawData.startsWith('[') ? JSON.parse(rawData) : rawData;
            resolve({ status: res.statusCode || 500, data });
          } catch {
            resolve({ status: res.statusCode || 500, data: rawData });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('🧪 Starting ApexBridge Comprehensive Test Suite (Dynamic User Data)...\n');
  let token = '';

  // 1. Landing & OpenAPI spec & Apollo Sandbox Page
  console.log('Testing Root, OpenAPI Spec, and Apollo Sandbox...');
  const rootRes = await request({ method: 'GET', path: '/' });
  assert(rootRes.status === 200, `Root status ${rootRes.status}`);
  const openapiRes = await request({ method: 'GET', path: '/openapi.json' });
  assert(openapiRes.status === 200 && openapiRes.data.openapi === '3.0.3', 'OpenAPI spec valid');
  const apolloRes = await request({ method: 'GET', path: '/apollo' });
  assert(apolloRes.status === 200 && typeof apolloRes.data === 'string' && apolloRes.data.includes('EmbeddedSandbox'), 'Apollo Sandbox HTML valid');
  console.log('✅ Root, OpenAPI, and Apollo Sandbox HTML OK');

  // 2. Signup a brand new user
  console.log('\nTesting 1. Signup New User (Zero Dummy Data)...');
  const email = `investor_${Date.now()}@apexbridge.com`;
  const signupRes = await request({
    method: 'POST',
    path: '/api/v1/auth/signup',
    body: {
      fullName: 'Real Investor',
      email,
      password: 'SecurePassword123!',
    },
  });
  assert(signupRes.status === 201 && signupRes.data.success === true, 'Signup successful');
  assert(signupRes.data.user.name === 'Real Investor', 'User name matches input exactly');
  assert(signupRes.data.user.balance === 0, 'New user starting balance is strictly 0');
  token = signupRes.data.token;
  console.log('✅ POST /api/v1/auth/signup OK');

  // 3. User Profile & Settings (Strictly user-entered)
  console.log('\nTesting 2. User Profile & Settings...');
  const profileRes = await request({ method: 'GET', path: '/api/v1/user/profile', token });
  assert(profileRes.status === 200 && profileRes.data.name === 'Real Investor', 'Profile name matches');
  assert(profileRes.data.phone === '', 'Unset phone is empty, no dummy phone');
  console.log('✅ GET /api/v1/user/profile OK');

  const updateProfileRes = await request({
    method: 'PATCH',
    path: '/api/v1/user/profile',
    token,
    body: {
      phone: '+1 (800) 555-0199',
      is2FAEnabled: true,
      currencyPreference: 'USD',
    },
  });
  assert(updateProfileRes.status === 200 && updateProfileRes.data.success === true, 'Profile update OK');
  console.log('✅ PATCH /api/v1/user/profile OK');

  // 4. Initial Wallet Summary (Should be exactly 0)
  console.log('\nTesting 3. Initial Clean Wallet Summary...');
  const initialWalletRes = await request({ method: 'GET', path: '/api/v1/wallet/summary', token });
  assert(initialWalletRes.status === 200 && initialWalletRes.data.data.totalPortfolio === 0, 'Initial portfolio is 0');
  assert(initialWalletRes.data.data.availableBalance === 0, 'Initial balance is 0');
  assert(initialWalletRes.data.data.activeInvestments === 0, 'Initial active investments is 0');
  assert(initialWalletRes.data.data.totalEarnings === 0, 'Initial earnings is 0');
  console.log('✅ GET /api/v1/wallet/summary (Initial 0.00 State) OK');

  // 5. Deposit and Credit Balance
  console.log('\nTesting 4. Deposits & Balance Inflow...');
  const createDepRes = await request({
    method: 'POST',
    path: '/api/v1/deposits',
    token,
    body: {
      method: 'btc',
      amount: 10000.0,
      currency: 'USD',
      transactionHash: '0xabc123',
    },
  });
  assert(createDepRes.status === 201 && createDepRes.data.transaction.status === 'pending', 'Deposit create OK');
  const depositTxId = createDepRes.data.transaction.id;

  // Admin approves deposit -> balance increases to 10000
  await request({
    method: 'PATCH',
    path: `/api/v1/admin/deposits/${depositTxId}/status`,
    body: { status: 'approved' },
  });

  const walletAfterDep = await request({ method: 'GET', path: '/api/v1/wallet/summary', token });
  assert(walletAfterDep.data.data.availableBalance === 10000, 'Balance updated to 10000 after deposit approval');
  console.log('✅ Deposit creation & approval credited balance correctly');

  // 6. Investments
  console.log('\nTesting 5. Investments...');
  const createInvRes = await request({
    method: 'POST',
    path: '/api/v1/investments',
    token,
    body: {
      planId: 'starter',
      planName: 'Apex Starter Tier',
      amount: 4000.0,
      roi: '15%',
    },
  });
  assert(createInvRes.status === 201 && createInvRes.data.newAvailableBalance === 6000, 'Deducted 4000 from 10000 balance -> 6000');
  const createdInvId = createInvRes.data.investment.id;

  const walletAfterInv = await request({ method: 'GET', path: '/api/v1/wallet/summary', token });
  assert(walletAfterInv.data.data.availableBalance === 6000, 'Available balance is 6000');
  assert(walletAfterInv.data.data.activeInvestments === 4000, 'Active investments is 4000');
  assert(walletAfterInv.data.data.totalPortfolio === 10000, 'Total portfolio is 10000');
  console.log('✅ Investment allocated and portfolio dynamically updated');

  // 7. Settle Investment
  console.log('\nTesting 6. Settle Investment Position...');
  const settleRes = await request({
    method: 'POST',
    path: `/api/v1/investments/${createdInvId}/settle`,
    token,
  });
  assert(settleRes.status === 200 && settleRes.data.settlement.payoutAmount === 4600, '4000 + 15% ROI = 4600 payout');
  console.log('✅ Settle investment returned principal + yield');

  // 8. Transactions Ledger
  console.log('\nTesting 7. Transactions Ledger (Only User Activity)...');
  const txsRes = await request({ method: 'GET', path: '/api/v1/transactions', token });
  assert(txsRes.status === 200 && txsRes.data.data.length === 3, 'Exactly 3 user transactions present (deposit, investment, settle)');
  console.log('✅ GET /api/v1/transactions (Strictly user transactions) OK');

  // 9. GraphQL Execution for User
  console.log('\nTesting 8. Apollo GraphQL Query for Authenticated User...');
  const gqlRes = await request({
    method: 'POST',
    path: '/graphql',
    body: {
      query: `
        query GetMyData {
          me { id name email balance }
          walletSummary { totalPortfolio availableBalance activeInvestments totalEarnings }
        }
      `,
    },
    token,
  });
  assert(gqlRes.status === 200 && gqlRes.data.data.me.name === 'Real Investor', 'GraphQL me.name matches user');
  assert(gqlRes.data.data.walletSummary.totalEarnings === 600, 'GraphQL totalEarnings is 600 (4600-4000)');
  console.log('✅ POST /graphql (Strictly user data resolved) OK');

  console.log('\n=======================================================');
  console.log('🎉 100% USER-ISOLATED DATA VALIDATED SUCCESSFULLY!');
  console.log('=======================================================\n');
}

initializeApp().then((app) => {
  server = app.listen(PORT, async () => {
    try {
      await runTestSuite();
      server.close();
      process.exit(0);
    } catch (err) {
      console.error('❌ Test failed with error:', err);
      server.close();
      process.exit(1);
    }
  });
});
