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
  console.log('🧪 Starting ApexBridge Comprehensive Test Suite (Mongoose + Seeded Admin + Sub-Admin)...\n');
  let userToken = '';
  let adminToken = '';

  // 1. Landing & OpenAPI spec & Apollo Sandbox Page
  console.log('Testing Root, OpenAPI Spec, and Apollo Sandbox...');
  const rootRes = await request({ method: 'GET', path: '/' });
  assert(rootRes.status === 200, `Root status ${rootRes.status}`);
  const openapiRes = await request({ method: 'GET', path: '/openapi.json' });
  assert(openapiRes.status === 200 && openapiRes.data.openapi === '3.0.3', 'OpenAPI spec valid');
  const apolloRes = await request({ method: 'GET', path: '/apollo' });
  assert(apolloRes.status === 200 && typeof apolloRes.data === 'string' && apolloRes.data.includes('EmbeddedSandbox'), 'Apollo Sandbox HTML valid');
  console.log('✅ Root, OpenAPI, and Apollo Sandbox HTML OK');

  // 2. Test Seeded Super Admin Login
  console.log('\nTesting 1. Seeded Super Admin Authentication...');
  const adminLoginRes = await request({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: 'admin@apexbridge.com',
      password: 'AdminPassword123!',
    },
  });
  assert(adminLoginRes.status === 200 && adminLoginRes.data.success === true, 'Super Admin login succeeded');
  assert(adminLoginRes.data.token && adminLoginRes.data.user.name === 'ApexBridge Super Admin', 'Super admin verified');
  adminToken = adminLoginRes.data.token;
  console.log('✅ Seeded Super Admin login OK (admin@apexbridge.com)');

  // 3. Signup a normal investor
  console.log('\nTesting 2. Signup Normal Investor User...');
  const investorEmail = `investor_${Date.now()}@apexbridge.com`;
  const signupRes = await request({
    method: 'POST',
    path: '/api/v1/auth/signup',
    body: {
      fullName: 'Standard Investor',
      email: investorEmail,
      password: 'SecurePassword123!',
    },
  });
  assert(signupRes.status === 201 && signupRes.data.success === true, 'Investor Signup successful');
  userToken = signupRes.data.token;
  console.log('✅ Standard Investor signup OK');

  // 4. Test Sub-Admin Creation: Investor MUST be blocked (403)
  console.log('\nTesting 3. Security: Non-Admin CANNOT create sub-admins...');
  const forbiddenCreateRes = await request({
    method: 'POST',
    path: '/api/v1/admin/sub-admins',
    token: userToken, // Investor token
    body: {
      email: 'illegal_subadmin@apexbridge.com',
      password: 'SomePassword123!',
    },
  });
  assert(forbiddenCreateRes.status === 403, `Expected 403 Forbidden for investor, got ${forbiddenCreateRes.status}`);
  console.log('✅ Security check passed: Standard investor blocked from creating sub-admin (403)');

  // 5. Test Sub-Admin Creation: Admin CAN create sub-admins
  console.log('\nTesting 4. Admin Creates Sub-Admin Endpoint...');
  const subAdminEmail = `subadmin_${Date.now()}@apexbridge.com`;
  const createSubAdminRes = await request({
    method: 'POST',
    path: '/api/v1/admin/sub-admins',
    token: adminToken, // Admin token
    body: {
      fullName: 'Regional Ops SubAdmin',
      email: subAdminEmail,
      password: 'SubAdminPass123!',
      permissions: ['deposits', 'withdrawals', 'balance_adjust'],
    },
  });
  assert(createSubAdminRes.status === 201 && createSubAdminRes.data.success === true, 'Sub-admin created successfully');
  assert(createSubAdminRes.data.subAdmin.email === subAdminEmail, 'Sub-admin email matches');
  assert(createSubAdminRes.data.subAdmin.role === 'sub-admin', 'Sub-admin role assigned');
  console.log(`✅ Admin created sub-admin OK (${subAdminEmail})`);

  // 6. Admin list sub-admins
  const listSubAdminsRes = await request({
    method: 'GET',
    path: '/api/v1/admin/sub-admins',
    token: adminToken,
  });
  assert(listSubAdminsRes.status === 200 && listSubAdminsRes.data.subAdmins.length >= 2, 'Sub-admins list retrieved');
  console.log(`✅ GET /api/v1/admin/sub-admins OK (Total: ${listSubAdminsRes.data.total})`);

  // 7. Sub-Admin can login
  const subAdminLogin = await request({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: subAdminEmail,
      password: 'SubAdminPass123!',
    },
  });
  assert(subAdminLogin.status === 200 && subAdminLogin.data.success === true, 'Sub-admin can login with credentials');
  console.log('✅ Newly created sub-admin logged in successfully');

  // 8. Admin balance increment & decrement by email
  console.log('\nTesting 5. Admin Increment and Decrement Balance by Email...');
  const incRes = await request({
    method: 'POST',
    path: '/api/v1/admin/users/balance',
    token: adminToken,
    body: {
      email: investorEmail,
      action: 'increment',
      amount: 15000.0,
      reason: 'Welcome Bonus',
    },
  });
  assert(incRes.status === 200 && incRes.data.data.newBalance === 15000, 'Balance incremented to 15000');

  const decRes = await request({
    method: 'POST',
    path: '/api/v1/admin/users/balance',
    token: adminToken,
    body: {
      email: investorEmail,
      action: 'decrement',
      amount: 5000.0,
      reason: 'Adjustment',
    },
  });
  assert(decRes.status === 200 && decRes.data.data.newBalance === 10000, 'Balance decremented to 10000');
  console.log('✅ Admin balance adjustment by email OK');

  // 9. Deposit submission with receipt image & admin view
  console.log('\nTesting 6. Deposit with Receipt Image...');
  const mockReceiptBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const createDepRes = await request({
    method: 'POST',
    path: '/api/v1/deposits',
    token: userToken,
    body: {
      method: 'btc',
      amount: 5000.0,
      currency: 'USD',
      transactionHash: '0x123456789abcdef',
      receiptImage: mockReceiptBase64,
    },
  });
  assert(createDepRes.status === 201, 'Deposit created');
  const depositTxId = createDepRes.data.transaction.id;

  const adminDepsRes = await request({ method: 'GET', path: '/api/v1/admin/deposits' });
  const foundDep = adminDepsRes.data.deposits.find((d: any) => d.id === depositTxId);
  assert(foundDep !== undefined && foundDep.receiptImage === mockReceiptBase64, 'Admin receives receipt image proof');
  console.log('✅ Deposit with receipt image reviewed by admin OK');

  // 10. GraphQL Sub-Admin query & mutation
  console.log('\nTesting 7. Apollo GraphQL Sub-Admin Query & Mutation...');
  const gqlSubAdminsRes = await request({
    method: 'POST',
    path: '/graphql',
    body: {
      query: `
        query GetSubAdmins {
          subAdmins {
            id
            name
            email
            role
            permissions
          }
        }
      `,
    },
  });
  assert(gqlSubAdminsRes.status === 200 && Array.isArray(gqlSubAdminsRes.data.data.subAdmins), 'GraphQL subAdmins listed');
  console.log('✅ Apollo GraphQL subAdmins query OK');

  console.log('\n========================================================================');
  console.log('🎉 ALL TESTS PASSED: MONGOOSE, SEEDED ADMIN & SUB-ADMINS 100% VERIFIED!');
  console.log('========================================================================\n');
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
