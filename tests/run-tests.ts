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
  console.log('🧪 Starting ApexBridge Comprehensive Test Suite with Receipt Image Upload...\n');
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
      fullName: 'Receipt Tester',
      email,
      password: 'SecurePassword123!',
    },
  });
  assert(signupRes.status === 201 && signupRes.data.success === true, 'Signup successful');
  assert(signupRes.data.user.name === 'Receipt Tester', 'User name matches input exactly');
  assert(signupRes.data.user.balance === 0, 'New user starting balance is strictly 0');
  token = signupRes.data.token;
  console.log('✅ POST /api/v1/auth/signup OK');

  // 3. User Profile & Settings
  console.log('\nTesting 2. User Profile & Settings...');
  const profileRes = await request({ method: 'GET', path: '/api/v1/user/profile', token });
  assert(profileRes.status === 200 && profileRes.data.name === 'Receipt Tester', 'Profile name matches');
  console.log('✅ GET /api/v1/user/profile OK');

  // 4. Submit Deposit with Receipt Image
  console.log('\nTesting 3. Submit Deposit with Receipt Proof Image...');
  const mockReceiptBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const createDepRes = await request({
    method: 'POST',
    path: '/api/v1/deposits',
    token,
    body: {
      method: 'btc',
      amount: 15000.0,
      currency: 'USD',
      transactionHash: '0x998877665544332211',
      receiptImage: mockReceiptBase64,
    },
  });
  assert(createDepRes.status === 201, 'Deposit created status 201');
  assert(createDepRes.data.transaction.receiptImage === mockReceiptBase64, 'Receipt image stored and returned on deposit');
  const depositTxId = createDepRes.data.transaction.id;
  console.log(`✅ POST /api/v1/deposits OK (Receipt Image Attached: ${depositTxId})`);

  // 5. User View Deposits (with Receipt Image)
  const userDepsRes = await request({ method: 'GET', path: '/api/v1/deposits', token });
  assert(userDepsRes.status === 200 && userDepsRes.data.deposits.length >= 1, 'User deposits listed');
  assert(userDepsRes.data.deposits[0].receiptImage === mockReceiptBase64, 'Receipt image visible in user deposit list');
  console.log('✅ GET /api/v1/deposits (User deposits with receipt) OK');

  // 6. Admin View All Deposits (with Receipt Proof and User Info)
  console.log('\nTesting 4. Admin View Deposits with Uploaded Receipt Images...');
  const adminDepsRes = await request({ method: 'GET', path: '/api/v1/admin/deposits' });
  assert(adminDepsRes.status === 200 && adminDepsRes.data.deposits.length >= 1, 'Admin deposits list retrieved');
  const adminFoundDep = adminDepsRes.data.deposits.find((d: any) => d.id === depositTxId);
  assert(adminFoundDep !== undefined, 'Admin found the submitted deposit');
  assert(adminFoundDep.receiptImage === mockReceiptBase64, 'Admin receives receipt image proof');
  assert(adminFoundDep.userName === 'Receipt Tester', 'Admin receives depositor user name');
  console.log('✅ GET /api/v1/admin/deposits (Admin receipt review) OK');

  // 7. Admin Approve Deposit
  console.log('\nTesting 5. Admin Approve Deposit...');
  const adminApproveRes = await request({
    method: 'PATCH',
    path: `/api/v1/admin/deposits/${depositTxId}/status`,
    body: { status: 'approved' },
  });
  assert(adminApproveRes.status === 200 && adminApproveRes.data.status === 'approved', 'Admin approved deposit');
  assert(adminApproveRes.data.receiptImage === mockReceiptBase64, 'Receipt image preserved in approval response');

  const walletAfterDep = await request({ method: 'GET', path: '/api/v1/wallet/summary', token });
  assert(walletAfterDep.data.data.availableBalance === 15000, 'Balance credited to 15000 after approval');
  console.log('✅ Deposit approved & user balance credited to $15,000');

  // 8. Investments
  console.log('\nTesting 6. Investment Allocation & Settlement...');
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
  assert(createInvRes.status === 201 && createInvRes.data.newAvailableBalance === 10000, 'Invested 5000 from 15000 -> 10000 left');
  const createdInvId = createInvRes.data.investment.id;

  const settleRes = await request({
    method: 'POST',
    path: `/api/v1/investments/${createdInvId}/settle`,
    token,
  });
  assert(settleRes.status === 200 && settleRes.data.settlement.payoutAmount === 6750, '5000 + 35% ROI = 6750 payout');
  console.log('✅ Investment allocated and settled with 35% yield');

  // 9. GraphQL Execution with Receipt Image
  console.log('\nTesting 7. Apollo GraphQL Deposit with Receipt & Admin Query...');
  const gqlDepositRes = await request({
    method: 'POST',
    path: '/graphql',
    body: {
      query: `
        mutation CreateDepositWithReceipt {
          createDeposit(method: "eth", amount: 2000.0, receiptImage: "data:image/png;base64,sample_receipt_data") {
            id
            amount
            receiptImage
            status
          }
        }
      `,
    },
    token,
  });
  assert(gqlDepositRes.status === 200 && gqlDepositRes.data.data.createDeposit.receiptImage === 'data:image/png;base64,sample_receipt_data', 'GraphQL createDeposit returned receiptImage');

  const gqlAdminRes = await request({
    method: 'POST',
    path: '/graphql',
    body: {
      query: `
        query GetAdminDeposits {
          adminDeposits {
            id
            amount
            userName
            receiptImage
            status
          }
        }
      `,
    },
  });
  assert(gqlAdminRes.status === 200 && Array.isArray(gqlAdminRes.data.data.adminDeposits), 'GraphQL adminDeposits listed');
  console.log('✅ Apollo GraphQL Deposit & Admin Receipt queries OK');

  console.log('\n=======================================================');
  console.log('🎉 ALL TESTS INCLUDING RECEIPT IMAGES PASSED 100%!');
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
