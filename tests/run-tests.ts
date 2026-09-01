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
  console.log('🧪 Starting ApexBridge Comprehensive Test Suite (with Admin Balance Adjust)...\n');
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
      fullName: 'Balance Adjustment Tester',
      email,
      password: 'SecurePassword123!',
    },
  });
  assert(signupRes.status === 201 && signupRes.data.success === true, 'Signup successful');
  assert(signupRes.data.user.name === 'Balance Adjustment Tester', 'User name matches input exactly');
  assert(signupRes.data.user.balance === 0, 'New user starting balance is strictly 0');
  token = signupRes.data.token;
  console.log('✅ POST /api/v1/auth/signup OK');

  // 3. Admin increment user balance by email
  console.log('\nTesting 2. Admin Increment User Balance by Email...');
  const incRes = await request({
    method: 'POST',
    path: '/api/v1/admin/users/balance',
    body: {
      email,
      action: 'increment',
      amount: 25000.0,
      reason: 'VIP Promotion Credit',
    },
  });
  assert(incRes.status === 200 && incRes.data.success === true, 'Balance increment OK');
  assert(incRes.data.data.newBalance === 25000, 'User balance incremented to 25000');
  assert(incRes.data.data.previousBalance === 0, 'Previous balance was 0');
  console.log(`✅ Admin incremented user balance to $${incRes.data.data.newBalance}`);

  // Check user wallet immediately reflects increment
  const walletAfterInc = await request({ method: 'GET', path: '/api/v1/wallet/summary', token });
  assert(walletAfterInc.data.data.availableBalance === 25000, 'User wallet balance is 25000');
  console.log('✅ User wallet summary updated to 25000');

  // 4. Admin decrement user balance by email
  console.log('\nTesting 3. Admin Decrement User Balance by Email...');
  const decRes = await request({
    method: 'POST',
    path: '/api/v1/admin/users/balance',
    body: {
      email,
      action: 'decrement',
      amount: 5000.0,
      reason: 'Fee Correction',
    },
  });
  assert(decRes.status === 200 && decRes.data.success === true, 'Balance decrement OK');
  assert(decRes.data.data.newBalance === 20000, 'User balance decremented from 25000 to 20000');
  console.log(`✅ Admin decremented user balance to $${decRes.data.data.newBalance}`);

  // Check user wallet immediately reflects decrement
  const walletAfterDec = await request({ method: 'GET', path: '/api/v1/wallet/summary', token });
  assert(walletAfterDec.data.data.availableBalance === 20000, 'User wallet balance is 20000');
  console.log('✅ User wallet summary updated to 20000');

  // 5. Submit Deposit with Receipt Image
  console.log('\nTesting 4. Submit Deposit with Receipt Proof Image...');
  const mockReceiptBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const createDepRes = await request({
    method: 'POST',
    path: '/api/v1/deposits',
    token,
    body: {
      method: 'btc',
      amount: 5000.0,
      currency: 'USD',
      transactionHash: '0x998877665544332211',
      receiptImage: mockReceiptBase64,
    },
  });
  assert(createDepRes.status === 201, 'Deposit created status 201');
  const depositTxId = createDepRes.data.transaction.id;

  const adminApproveRes = await request({
    method: 'PATCH',
    path: `/api/v1/admin/deposits/${depositTxId}/status`,
    body: { status: 'approved' },
  });
  assert(adminApproveRes.status === 200 && adminApproveRes.data.status === 'approved', 'Admin approved deposit');
  console.log('✅ Deposit submitted and approved');

  // 6. Investments
  console.log('\nTesting 5. Investments & Settlement...');
  const createInvRes = await request({
    method: 'POST',
    path: '/api/v1/investments',
    token,
    body: {
      planId: 'vault',
      planName: 'Quantum Yield Vault',
      amount: 5000.0,
      roi: '35%',
    },
  });
  assert(createInvRes.status === 201, 'Investment created');
  const createdInvId = createInvRes.data.investment.id;

  const settleRes = await request({
    method: 'POST',
    path: `/api/v1/investments/${createdInvId}/settle`,
    token,
  });
  assert(settleRes.status === 200 && settleRes.data.settlement.payoutAmount === 6750, 'Settlement OK');
  console.log('✅ Investment settled');

  // 7. GraphQL Admin Balance Adjust Mutation
  console.log('\nTesting 6. Apollo GraphQL Admin Balance Adjustment...');
  const gqlAdminAdjust = await request({
    method: 'POST',
    path: '/graphql',
    body: {
      query: `
        mutation AdminAdjust($email: String!, $action: String!, $amount: Float!) {
          adminAdjustUserBalance(email: $email, action: $action, amount: $amount, reason: "GraphQL Admin Adjustment") {
            success
            message
            data {
              email
              previousBalance
              newBalance
              action
              amount
            }
          }
        }
      `,
      variables: {
        email,
        action: 'increment',
        amount: 3000.0,
      },
    },
  });
  assert(gqlAdminAdjust.status === 200 && gqlAdminAdjust.data.data.adminAdjustUserBalance.success === true, 'GraphQL admin adjust OK');
  console.log(`✅ Apollo GraphQL Admin Balance Adjustment OK (New Balance: $${gqlAdminAdjust.data.data.adminAdjustUserBalance.data.newBalance})`);

  console.log('\n=======================================================');
  console.log('🎉 ALL TESTS INCLUDING ADMIN BALANCE ADJUST PASSED 100%!');
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
