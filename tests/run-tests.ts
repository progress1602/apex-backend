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
  console.log('🧪 Starting ApexBridge Comprehensive Test Suite (REST + Apollo GraphQL)...\n');
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

  // 2. Authentication & Sessions
  console.log('\nTesting 1. Authentication & Sessions...');
  const loginRes = await request({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: 'alexander@apexbridge.com',
      password: 'SecurePassword123!',
    },
  });
  assert(loginRes.status === 200 && loginRes.data.success === true, 'Login successful');
  token = loginRes.data.token;
  assert(typeof token === 'string' && token.length > 10, 'JWT token generated');
  console.log('✅ POST /api/v1/auth/login OK');

  const meRes = await request({ method: 'GET', path: '/api/v1/auth/me', token });
  assert(meRes.status === 200 && meRes.data.user.email === 'alexander@apexbridge.com', 'Me endpoint verified');
  console.log('✅ GET /api/v1/auth/me OK');

  const signupEmail = `tester_${Date.now()}@apexbridge.com`;
  const signupRes = await request({
    method: 'POST',
    path: '/api/v1/auth/signup',
    body: {
      fullName: 'Test Investor',
      email: signupEmail,
      password: 'SecurePassword123!',
    },
  });
  assert(signupRes.status === 201 && signupRes.data.success === true, 'Signup successful');
  console.log('✅ POST /api/v1/auth/signup OK');

  // 3. User Profile & Settings
  console.log('\nTesting 2. User Profile & Settings...');
  const profileRes = await request({ method: 'GET', path: '/api/v1/user/profile', token });
  assert(profileRes.status === 200 && profileRes.data.tier === 'Tier 2 - Verified', 'Profile read OK');
  console.log('✅ GET /api/v1/user/profile OK');

  const updateProfileRes = await request({
    method: 'PATCH',
    path: '/api/v1/user/profile',
    token,
    body: {
      name: 'Alexander Vance',
      phone: '+1 (555) 234-5678',
      is2FAEnabled: true,
      currencyPreference: 'USD',
    },
  });
  assert(updateProfileRes.status === 200 && updateProfileRes.data.success === true, 'Profile update OK');
  console.log('✅ PATCH /api/v1/user/profile OK');

  // 4. Dashboard, Wallet & Market Metrics
  console.log('\nTesting 3. Dashboard, Wallet & Market Metrics...');
  const walletRes = await request({ method: 'GET', path: '/api/v1/wallet/summary', token });
  assert(walletRes.status === 200 && walletRes.data.data.totalPortfolio > 0, 'Wallet summary OK');
  console.log('✅ GET /api/v1/wallet/summary OK');

  const chartRes = await request({ method: 'GET', path: '/api/v1/analytics/chart?period=1M' });
  assert(chartRes.status === 200 && Array.isArray(chartRes.data.data), 'Chart data OK');
  console.log('✅ GET /api/v1/analytics/chart OK');

  const tickersRes = await request({ method: 'GET', path: '/api/v1/market/tickers' });
  assert(tickersRes.status === 200 && Array.isArray(tickersRes.data.tickers), 'Market tickers OK');
  console.log('✅ GET /api/v1/market/tickers OK');

  // 5. Deposits
  console.log('\nTesting 4. Deposits...');
  const methodsRes = await request({ method: 'GET', path: '/api/v1/deposits/methods' });
  assert(methodsRes.status === 200 && methodsRes.data.methods.length >= 2, 'Deposit methods OK');
  console.log('✅ GET /api/v1/deposits/methods OK');

  const createDepRes = await request({
    method: 'POST',
    path: '/api/v1/deposits',
    token,
    body: {
      method: 'btc',
      amount: 2500.0,
      currency: 'USD',
      transactionHash: '0x9f83a2182049124182b89410482012',
    },
  });
  assert(createDepRes.status === 201 && createDepRes.data.transaction.status === 'pending', 'Deposit create OK');
  const depositTxId = createDepRes.data.transaction.id;
  console.log(`✅ POST /api/v1/deposits OK (tx: ${depositTxId})`);

  // 6. Investments & Yield Matrix
  console.log('\nTesting 5. Investments & Yield Matrix...');
  const plansRes = await request({ method: 'GET', path: '/api/v1/investments/plans' });
  assert(plansRes.status === 200 && plansRes.data.plans.length >= 3, 'Plans list OK');
  console.log('✅ GET /api/v1/investments/plans OK');

  const invListRes = await request({ method: 'GET', path: '/api/v1/investments', token });
  assert(invListRes.status === 200 && Array.isArray(invListRes.data.investments), 'Investments list OK');
  console.log('✅ GET /api/v1/investments OK');

  const createInvRes = await request({
    method: 'POST',
    path: '/api/v1/investments',
    token,
    body: {
      planId: 'starter',
      planName: 'Apex Starter Tier',
      amount: 5000.0,
      roi: '15%',
    },
  });
  assert(createInvRes.status === 201 && createInvRes.data.investment.amount === 5000, 'Create investment OK');
  const createdInvId = createInvRes.data.investment.id;
  console.log(`✅ POST /api/v1/investments OK (inv: ${createdInvId})`);

  const settleRes = await request({
    method: 'POST',
    path: `/api/v1/investments/inv_7721/settle`,
    token,
  });
  assert(settleRes.status === 200 && settleRes.data.settlement.status === 'completed', 'Settle investment OK');
  console.log('✅ POST /api/v1/investments/:id/settle OK');

  // 7. Withdrawals
  console.log('\nTesting 6. Withdrawals...');
  const wdrRes = await request({
    method: 'POST',
    path: '/api/v1/withdrawals',
    token,
    body: {
      amount: 3200.0,
      method: 'btc',
      destinationAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      twoFactorCode: '849201',
    },
  });
  assert(wdrRes.status === 201 && wdrRes.data.withdrawal.status === 'pending', 'Withdrawal request OK');
  const wdrTxId = wdrRes.data.withdrawal.id;
  console.log(`✅ POST /api/v1/withdrawals OK (tx: ${wdrTxId})`);

  // 8. Transactions Ledger
  console.log('\nTesting 7. Transactions Ledger & History...');
  const txsRes = await request({ method: 'GET', path: '/api/v1/transactions?type=all&status=all&page=1&limit=20', token });
  assert(txsRes.status === 200 && Array.isArray(txsRes.data.data), 'Transactions ledger OK');
  console.log(`✅ GET /api/v1/transactions OK (${txsRes.data.data.length} total entries)`);

  // 9. Notifications
  console.log('\nTesting 8. Notifications & Alerts...');
  const notifsRes = await request({ method: 'GET', path: '/api/v1/notifications', token });
  assert(notifsRes.status === 200 && notifsRes.data.notifications.length >= 2, 'Notifications list OK');
  console.log('✅ GET /api/v1/notifications OK');

  const readNotifRes = await request({ method: 'PATCH', path: '/api/v1/notifications/notif_001/read', token });
  assert(readNotifRes.status === 200 && readNotifRes.data.success === true, 'Mark read OK');
  console.log('✅ PATCH /api/v1/notifications/:id/read OK');

  const markAllRes = await request({ method: 'POST', path: '/api/v1/notifications/mark-all-read', token });
  assert(markAllRes.status === 200 && markAllRes.data.success === true, 'Mark all read OK');
  console.log('✅ POST /api/v1/notifications/mark-all-read OK');

  // 10. Administrative Operations
  console.log('\nTesting 9. Administrative & Back-Office Operations...');
  const adminDepRes = await request({
    method: 'PATCH',
    path: `/api/v1/admin/deposits/${depositTxId}/status`,
    body: { status: 'approved' },
  });
  assert(adminDepRes.status === 200 && adminDepRes.data.status === 'approved', 'Admin deposit status OK');
  console.log('✅ PATCH /api/v1/admin/deposits/:id/status OK');

  const adminWdrRes = await request({
    method: 'PATCH',
    path: `/api/v1/admin/withdrawals/${wdrTxId}/status`,
    body: { status: 'processed', txHash: '0x78a1bc92048592019485091823' },
  });
  assert(adminWdrRes.status === 200 && adminWdrRes.data.status === 'processed', 'Admin withdrawal status OK');
  console.log('✅ PATCH /api/v1/admin/withdrawals/:id/status OK');

  const adminPlanRes = await request({
    method: 'PUT',
    path: '/api/v1/admin/plans/starter',
    body: {
      roi: '18%',
      minAmount: 1000,
      maxAmount: 10000,
      feeRate: 0.08,
    },
  });
  assert(adminPlanRes.status === 200 && adminPlanRes.data.success === true, 'Admin plan update OK');
  console.log('✅ PUT /api/v1/admin/plans/:id OK');

  // 11. Apollo GraphQL Query Verification
  console.log('\nTesting 10. Apollo GraphQL Execution (/graphql)...');
  const gqlQuery = {
    query: `
      query TestDashboard {
        me { id name email balance tier }
        walletSummary { totalPortfolio availableBalance activeInvestments totalEarnings }
        marketTickers { symbol price change24h }
      }
    `,
  };
  const gqlRes = await request({
    method: 'POST',
    path: '/graphql',
    body: gqlQuery,
    token,
  });
  assert(gqlRes.status === 200 && gqlRes.data.data && gqlRes.data.data.me.email === 'alexander@apexbridge.com', 'GraphQL query execution successful');
  console.log('✅ POST /graphql (Apollo GraphQL Engine) OK');

  console.log('\n=======================================================');
  console.log('🎉 ALL REST & APOLLO GRAPHQL ENDPOINTS PASSED 100%!');
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
