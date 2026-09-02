import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import {
  UserModel,
  DepositModel,
  InvestmentModel,
  WithdrawalModel,
  TransactionModel,
  NotificationModel,
  PlanModel,
} from '../models';

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

async function runMigration() {
  console.log('=======================================================');
  console.log('🚀 ApexBridge: Safe JSON to MongoDB Atlas Migration');
  console.log('=======================================================');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable is required to run migration.');
    process.exit(1);
  }

  if (!fs.existsSync(DB_FILE)) {
    console.log(`ℹ️ No legacy db.json file found at ${DB_FILE}. Nothing to migrate.`);
    process.exit(0);
  }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri);
  console.log(`✅ Connected to MongoDB database: ${mongoose.connection.name}`);

  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  const data = JSON.parse(raw);

  let migratedUsers = 0;
  let skippedUsers = 0;
  let migratedDeposits = 0;
  let migratedInvestments = 0;
  let migratedWithdrawals = 0;
  let migratedTransactions = 0;
  let migratedNotifications = 0;

  // 1. Migrate Users
  if (Array.isArray(data.users)) {
    console.log(`\nScanning ${data.users.length} legacy users...`);
    for (const item of data.users) {
      const u = Array.isArray(item) ? item[1] : item;
      if (!u || !u.email) continue;

      const userId = u.userId || u.id;
      const cleanEmail = u.email.trim().toLowerCase();

      // Check if user already exists in MongoDB Atlas by email or userId
      const existing = await UserModel.findOne({
        $or: [{ email: cleanEmail }, { userId }],
      });

      if (!existing) {
        await UserModel.create({
          userId,
          name: u.name || 'Investor',
          email: cleanEmail,
          passwordHash: u.passwordHash,
          role: u.role || 'investor',
          tier: u.tier || 'Tier 1 - Standard',
          avatar: u.avatar || '',
          balance: typeof u.balance === 'number' ? u.balance : 0.0,
          phone: u.phone || '',
          is2FAEnabled: Boolean(u.is2FAEnabled),
          currencyPreference: u.currencyPreference || 'USD',
          notifications: u.notifications || { email: true, sms: false, yieldAlerts: false },
          permissions: u.permissions || [],
          createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        });
        migratedUsers++;
        console.log(`  + Migrated user: ${cleanEmail} (${userId}) with balance $${u.balance}`);
      } else {
        skippedUsers++;
      }
    }
  }

  // 2. Migrate Deposits
  if (Array.isArray(data.depositTransactions)) {
    console.log(`\nScanning ${data.depositTransactions.length} legacy deposits...`);
    for (const item of data.depositTransactions) {
      const dep = Array.isArray(item) ? item[1] : item;
      if (!dep) continue;
      const depositId = dep.depositId || dep.id;

      const existing = await DepositModel.findOne({ depositId });
      if (!existing) {
        await DepositModel.create({
          depositId,
          userId: dep.userId,
          userName: dep.userName || '',
          userEmail: dep.userEmail || '',
          type: dep.type || 'deposit',
          amount: dep.amount,
          method: dep.method || 'Bitcoin (BTC)',
          currency: dep.currency || 'USD',
          transactionHash: dep.transactionHash || '',
          receiptImage: dep.receiptImage || '',
          status: dep.status || 'pending',
          createdAt: dep.createdAt ? new Date(dep.createdAt) : new Date(),
        });
        migratedDeposits++;
        console.log(`  + Migrated deposit: ${depositId} ($${dep.amount})`);
      }
    }
  }

  // 3. Migrate User Investments
  if (Array.isArray(data.userInvestments)) {
    console.log(`\nScanning ${data.userInvestments.length} legacy investments...`);
    for (const item of data.userInvestments) {
      const inv = Array.isArray(item) ? item[1] : item;
      if (!inv) continue;
      const investmentId = inv.investmentId || inv.id;

      const existing = await InvestmentModel.findOne({ investmentId });
      if (!existing) {
        await InvestmentModel.create({
          investmentId,
          userId: inv.userId,
          planId: inv.planId || 'starter',
          planName: inv.planName || 'Apex Starter Tier',
          amount: inv.amount,
          roi: inv.roi || '15%',
          progress: typeof inv.progress === 'number' ? inv.progress : 0,
          projectedReturn: inv.projectedReturn,
          status: inv.status || 'active',
          startDate: inv.startDate ? new Date(inv.startDate) : new Date(),
          maturityDate: inv.maturityDate ? new Date(inv.maturityDate) : new Date(),
        });
        migratedInvestments++;
        console.log(`  + Migrated investment: ${investmentId} ($${inv.amount})`);
      }
    }
  }

  // 4. Migrate Withdrawals
  if (Array.isArray(data.withdrawalTransactions)) {
    console.log(`\nScanning ${data.withdrawalTransactions.length} legacy withdrawals...`);
    for (const item of data.withdrawalTransactions) {
      const wdr = Array.isArray(item) ? item[1] : item;
      if (!wdr) continue;
      const withdrawalId = wdr.withdrawalId || wdr.id;

      const existing = await WithdrawalModel.findOne({ withdrawalId });
      if (!existing) {
        await WithdrawalModel.create({
          withdrawalId,
          userId: wdr.userId,
          userName: wdr.userName || '',
          userEmail: wdr.userEmail || '',
          type: wdr.type || 'withdrawal',
          amount: wdr.amount,
          fee: wdr.fee || 15.0,
          netPayout: wdr.netPayout,
          method: wdr.method || 'btc',
          destinationAddress: wdr.destinationAddress || '',
          status: wdr.status || 'pending',
          txHash: wdr.txHash || '',
          createdAt: wdr.createdAt ? new Date(wdr.createdAt) : new Date(),
        });
        migratedWithdrawals++;
        console.log(`  + Migrated withdrawal: ${withdrawalId} ($${wdr.amount})`);
      }
    }
  }

  // 5. Migrate Transactions
  if (Array.isArray(data.transactions)) {
    console.log(`\nScanning ${data.transactions.length} legacy transaction ledger items...`);
    for (const tx of data.transactions) {
      if (!tx) continue;
      const transactionId = tx.transactionId || tx.id;

      const existing = await TransactionModel.findOne({ transactionId });
      if (!existing) {
        await TransactionModel.create({
          transactionId,
          userId: tx.userId,
          type: tx.type,
          amount: tx.amount,
          status: tx.status,
          plan: tx.plan,
          receiptImage: tx.receiptImage || '',
          date: tx.date || (tx.createdAt ? new Date(tx.createdAt).toISOString() : new Date().toISOString()),
        });
        migratedTransactions++;
      }
    }
    console.log(`  + Migrated ${migratedTransactions} transaction records`);
  }

  // 6. Migrate Notifications
  if (Array.isArray(data.notifications)) {
    console.log(`\nScanning ${data.notifications.length} legacy notifications...`);
    for (const item of data.notifications) {
      const notif = Array.isArray(item) ? item[1] : item;
      if (!notif) continue;
      const notificationId = notif.notificationId || notif.id;

      const existing = await NotificationModel.findOne({ notificationId });
      if (!existing) {
        await NotificationModel.create({
          notificationId,
          userId: notif.userId,
          title: notif.title,
          message: notif.message,
          type: notif.type || 'system',
          isRead: Boolean(notif.isRead),
          createdAt: notif.createdAt ? new Date(notif.createdAt) : new Date(),
        });
        migratedNotifications++;
      }
    }
    console.log(`  + Migrated ${migratedNotifications} notification records`);
  }

  console.log('\n=======================================================');
  console.log('🎉 Migration Completed Successfully!');
  console.log(`   - Users Migrated:         ${migratedUsers} (Already present: ${skippedUsers})`);
  console.log(`   - Deposits Migrated:      ${migratedDeposits}`);
  console.log(`   - Investments Migrated:   ${migratedInvestments}`);
  console.log(`   - Withdrawals Migrated:   ${migratedWithdrawals}`);
  console.log(`   - Transactions Migrated:  ${migratedTransactions}`);
  console.log(`   - Notifications Migrated: ${migratedNotifications}`);
  console.log('=======================================================');

  await mongoose.disconnect();
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
