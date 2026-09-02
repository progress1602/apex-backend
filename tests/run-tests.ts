process.env.NODE_ENV = 'test';

import http from 'http';
import mongoose from 'mongoose';
import { initializeApp } from '../src/app';
import { UserModel, DepositModel, InvestmentModel, WithdrawalModel, TransactionModel, NotificationModel } from '../src/models';

let server: http.Server;
const PORT = 5098;
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
  console.log('🧪 Starting ApexBridge Comprehensive MongoDB Atlas Verification Suite...\n');
  let userToken = '';
  let adminToken = '';
  let testUserId = '';
  const testEmail = `investor_${Date.now()}@apexbridge.com`;
  const testPassword = 'SecurePassword123!';

  // 1. Root & Health
  console.log('1. Testing Root & OpenAPI Schema...');
  const rootRes = await request({ method: 'GET', path: '/' });
  assert(rootRes.status === 200, 'Root status 200');
  const openapiRes = await request({ method: 'GET', path: '/openapi.json' });
  assert(openapiRes.status === 200 && openapiRes.data.openapi === '3.0.3', 'OpenAPI 3.0.3 valid');
  console.log('✅ Root & OpenAPI endpoints OK');

  // 2. Seeded Admin Authentication
  console.log('\n2. Testing Seeded Super Admin Login (admin@apexbridge.com)...');
  const adminLogin = await request({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: 'admin@apexbridge.com',
      password: 'AdminPassword123!',
    },
  });
  assert(adminLogin.status === 200 && adminLogin.data.success === true, 'Admin login failed');
  adminToken = adminLogin.data.token;
  assert(adminLogin.data.user.role === 'admin', 'Admin role verified');
  console.log('✅ Super Admin login succeeded');

  // 3. User Signup
  console.log('\n3. Testing User Signup directly in MongoDB...');
  const signupRes = await request({
    method: 'POST',
    path: '/api/v1/auth/signup',
    body: {
      fullName: 'Mongo Test User',
      email: testEmail,
      password: testPassword,
      phone: '+1 (555) 019-2834',
    },
  });
  assert(signupRes.status === 201 && signupRes.data.success === true, 'Signup failed');
  userToken = signupRes.data.token;
  testUserId = signupRes.data.user.id;

  // Verify user document in MongoDB directly
  const mongoUser = await UserModel.findOne({ email: testEmail });
  assert(mongoUser !== null, 'User document not found in MongoDB!');
  assert(mongoUser!.userId === testUserId, 'User ID in MongoDB matches response');
  assert(mongoUser!.balance === 0, 'New user starting balance is strictly 0');
  console.log(`✅ User signed up and verified in MongoDB (userId: ${testUserId})`);

  // 4. Test Login Scenarios: Success, Nonexistent Email, Wrong Password
  console.log('\n4. Testing Authentication Edge Cases...');
  // A: Nonexistent email
  const nonexistentLogin = await request({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: 'nonexistent_account_xyz@apexbridge.com',
      password: 'SomePassword123!',
    },
  });
  assert(nonexistentLogin.status === 401, `Expected 401 for nonexistent email, got ${nonexistentLogin.status}`);

  // B: Wrong password
  const wrongPassLogin = await request({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: testEmail,
      password: 'CompletelyWrongPassword!',
    },
  });
  assert(wrongPassLogin.status === 401, `Expected 401 for wrong password, got ${wrongPassLogin.status}`);

  // C: Correct credentials
  const validLogin = await request({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: {
      email: testEmail,
      password: testPassword,
    },
  });
  assert(validLogin.status === 200 && validLogin.data.success === true, 'Valid login failed');
  console.log('✅ Nonexistent email (401), Wrong password (401), and Valid login (200) verified');

  // 5. Test Profile Update
  console.log('\n5. Testing Profile Update & MongoDB Persistence...');
  const patchProfile = await request({
    method: 'PATCH',
    path: '/api/v1/user/profile',
    token: userToken,
    body: {
      name: 'Mongo Test User Renamed',
      currencyPreference: 'EUR',
    },
  });
  assert(patchProfile.status === 200 && patchProfile.data.success === true, 'Profile patch failed');
  const updatedMongoUser = await UserModel.findOne({ userId: testUserId });
  assert(updatedMongoUser!.name === 'Mongo Test User Renamed', 'Name not updated in MongoDB');
  assert(updatedMongoUser!.currencyPreference === 'EUR', 'Currency not updated in MongoDB');
  console.log('✅ Profile updated and verified in MongoDB');

  // 6. Test Deposit Creation with Receipt Image & Admin Approval
  console.log('\n6. Testing Deposit Creation & Transaction Persistence...');
  const mockReceipt = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const depRes = await request({
    method: 'POST',
    path: '/api/v1/deposits',
    token: userToken,
    body: {
      method: 'btc',
      amount: 20000.0,
      currency: 'USD',
      transactionHash: '0xabc1234567890',
      receiptImage: mockReceipt,
    },
  });
  assert(depRes.status === 201 && depRes.data.success === true, 'Deposit submission failed');
  const depositTxId = depRes.data.transaction.id;

  // Verify Deposit and Transaction documents in MongoDB
  const mongoDeposit = await DepositModel.findOne({ depositId: depositTxId });
  assert(mongoDeposit !== null, 'Deposit document not found in MongoDB');
  assert(mongoDeposit!.receiptImage === mockReceipt, 'Receipt image not persisted in MongoDB');

  const mongoDepTx = await TransactionModel.findOne({ transactionId: depositTxId });
  assert(mongoDepTx !== null, 'Transaction document not found in MongoDB');
  assert(mongoDepTx!.status === 'pending', 'Transaction status is pending');
  console.log(`✅ Deposit ${depositTxId} & transaction created in MongoDB`);

  // Admin approves deposit
  console.log('Admin approving deposit...');
  const approveRes = await request({
    method: 'PATCH',
    path: `/api/v1/admin/deposits/${depositTxId}/status`,
    body: { status: 'approved' },
  });
  assert(approveRes.status === 200 && approveRes.data.status === 'approved', 'Deposit approval failed');

  // Verify user balance incremented in MongoDB
  const userAfterDep = await UserModel.findOne({ userId: testUserId });
  assert(userAfterDep!.balance === 20000, `Expected balance 20000, got ${userAfterDep!.balance}`);
  console.log(`✅ Deposit approved and user balance updated to $${userAfterDep!.balance} in MongoDB`);

  // 7. Test Investment Allocation and Settlement
  console.log('\n7. Testing Investment Creation & Settlement...');
  const invRes = await request({
    method: 'POST',
    path: '/api/v1/investments',
    token: userToken,
    body: {
      planId: 'vault',
      planName: 'Quantum Yield Vault',
      amount: 5000.0,
      roi: '35%',
    },
  });
  assert(invRes.status === 201 && invRes.data.success === true, 'Investment creation failed');
  const invId = invRes.data.investment.id;

  // Verify in MongoDB: Balance deducted to 15000, investment document exists
  const userAfterInv = await UserModel.findOne({ userId: testUserId });
  assert(userAfterInv!.balance === 15000, `Expected balance 15000 after investment, got ${userAfterInv!.balance}`);
  const mongoInv = await InvestmentModel.findOne({ investmentId: invId });
  assert(mongoInv !== null && mongoInv!.status === 'active', 'Investment not found in MongoDB');

  // Settle investment (5000 + 35% = 6750 payout)
  const settleRes = await request({
    method: 'POST',
    path: `/api/v1/investments/${invId}/settle`,
    token: userToken,
  });
  assert(settleRes.status === 200 && settleRes.data.success === true, 'Settlement failed');
  assert(settleRes.data.settlement.payoutAmount === 6750, 'Payout amount is 6750');

  const userAfterSettle = await UserModel.findOne({ userId: testUserId });
  assert(userAfterSettle!.balance === 21750, `Expected balance 21750 after settlement, got ${userAfterSettle!.balance}`);
  console.log(`✅ Investment created and settled. New user balance: $${userAfterSettle!.balance}`);

  // 8. Test Withdrawal Request
  console.log('\n8. Testing Withdrawal Creation...');
  const wdrRes = await request({
    method: 'POST',
    path: '/api/v1/withdrawals',
    token: userToken,
    body: {
      amount: 1750.0,
      method: 'btc',
      destinationAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    },
  });
  assert(wdrRes.status === 201 && wdrRes.data.success === true, 'Withdrawal request failed');
  const wdrId = wdrRes.data.withdrawal.id;

  // Verify in MongoDB: Balance deducted from 21750 to 20000
  const userAfterWdr = await UserModel.findOne({ userId: testUserId });
  assert(userAfterWdr!.balance === 20000, `Expected balance 20000 after withdrawal, got ${userAfterWdr!.balance}`);
  const mongoWdr = await WithdrawalModel.findOne({ withdrawalId: wdrId });
  assert(mongoWdr !== null && mongoWdr!.amount === 1750, 'Withdrawal document not found in MongoDB');
  console.log(`✅ Withdrawal created and verified in MongoDB. Balance: $${userAfterWdr!.balance}`);

  // 9. Test Notification creation & retrieval
  console.log('\n9. Testing Notifications in MongoDB...');
  const notifsRes = await request({ method: 'GET', path: '/api/v1/notifications', token: userToken });
  assert(notifsRes.status === 200, 'Failed to fetch notifications');
  assert(Array.isArray(notifsRes.data.notifications), 'Notifications is an array');
  console.log(`✅ Notifications retrieved directly from MongoDB (${notifsRes.data.notifications.length} items)`);

  // 10. Test Admin Balance Adjust (Increment & Decrement by email)
  console.log('\n10. Testing Admin Balance Adjustment by Email...');
  const incRes = await request({
    method: 'POST',
    path: '/api/v1/admin/users/balance',
    token: adminToken,
    body: {
      email: testEmail,
      action: 'increment',
      amount: 10000.0,
      reason: 'VIP Reward',
    },
  });
  assert(incRes.status === 200 && incRes.data.data.newBalance === 30000, 'Admin increment failed');

  const decRes = await request({
    method: 'POST',
    path: '/api/v1/admin/users/balance',
    token: adminToken,
    body: {
      email: testEmail,
      action: 'decrement',
      amount: 5000.0,
      reason: 'Correction',
    },
  });
  assert(decRes.status === 200 && decRes.data.data.newBalance === 25000, 'Admin decrement failed');

  const userAfterAdjust = await UserModel.findOne({ userId: testUserId });
  assert(userAfterAdjust!.balance === 25000, 'Balance adjustment not reflected in MongoDB');
  console.log(`✅ Admin balance adjustment verified in MongoDB: Final balance $${userAfterAdjust!.balance}`);

  // 11. Test Sub-Admin Creation & Role Security
  console.log('\n11. Testing Sub-Admin Creation & Role Guard...');
  // Non-admin attempt -> must fail with 403
  const forbiddenCreate = await request({
    method: 'POST',
    path: '/api/v1/admin/sub-admins',
    token: userToken, // Normal investor token
    body: {
      email: 'illegal_subadmin@apexbridge.com',
      password: 'SomePassword123!',
    },
  });
  assert(forbiddenCreate.status === 403, `Expected 403 Forbidden, got ${forbiddenCreate.status}`);

  // Admin attempt -> succeeds
  const subAdminEmail = `subadmin_${Date.now()}@apexbridge.com`;
  const subAdminRes = await request({
    method: 'POST',
    path: '/api/v1/admin/sub-admins',
    token: adminToken,
    body: {
      fullName: 'Regional Operations Manager',
      email: subAdminEmail,
      password: 'SubAdminPassword123!',
      permissions: ['deposits', 'withdrawals'],
    },
  });
  assert(subAdminRes.status === 201 && subAdminRes.data.success === true, 'Sub-admin creation failed');
  const mongoSubAdmin = await UserModel.findOne({ email: subAdminEmail });
  assert(mongoSubAdmin !== null && mongoSubAdmin!.role === 'sub-admin', 'Sub-admin not in MongoDB');
  console.log(`✅ Security check passed: Investor blocked (403), Admin created sub-admin in MongoDB`);

  // 12. Test GraphQL Engine (Apollo)
  console.log('\n12. Testing Apollo GraphQL Engine backed by MongoDB...');
  const gqlMeRes = await request({
    method: 'POST',
    path: '/graphql',
    token: userToken,
    body: {
      query: `
        query GetMe {
          me {
            id
            name
            email
            balance
            tier
          }
          walletSummary {
            totalPortfolio
            availableBalance
          }
          subAdmins {
            id
            name
            email
            role
          }
        }
      `,
    },
  });
  assert(gqlMeRes.status === 200 && gqlMeRes.data.data.me.balance === 25000, 'GraphQL me query balance mismatch');
  assert(Array.isArray(gqlMeRes.data.data.subAdmins), 'GraphQL subAdmins returned array');
  console.log('✅ Apollo GraphQL queries executed directly against MongoDB Atlas');

  console.log('\n========================================================================');
  console.log('🎉 ALL INTEGRATION & SECURITY TESTS PASSED AGAINST MONGODB ATLAS!');
  console.log('========================================================================\n');
}

// Start test server
initializeApp().then((app) => {
  server = app.listen(PORT, async () => {
    try {
      await runTestSuite();
      server.close();
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      console.error('❌ Test suite failed with error:', err);
      server.close();
      await mongoose.disconnect();
      process.exit(1);
    }
  });
});
