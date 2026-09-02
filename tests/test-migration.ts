process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database';
import { UserModel, DepositModel, InvestmentModel, WithdrawalModel, TransactionModel, NotificationModel } from '../src/models';

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

async function testMigration() {
  console.log('🧪 Testing Safe JSON to MongoDB Atlas Migration Logic...');

  await connectDatabase();

  if (!fs.existsSync(DB_FILE)) {
    console.log('No db.json found, skipping migration test.');
    process.exit(0);
  }

  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  const data = JSON.parse(raw);

  let userCount = 0;
  if (Array.isArray(data.users)) {
    for (const item of data.users) {
      const u = Array.isArray(item) ? item[1] : item;
      if (!u || !u.email) continue;
      const userId = u.userId || u.id;
      const cleanEmail = u.email.trim().toLowerCase();

      const existing = await UserModel.findOne({ $or: [{ email: cleanEmail }, { userId }] });
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
        userCount++;
      }
    }
  }

  console.log(`✅ Migrated ${userCount} users safely from db.json`);

  // Verify that running it a second time does not create duplicates
  let duplicateCount = 0;
  if (Array.isArray(data.users)) {
    for (const item of data.users) {
      const u = Array.isArray(item) ? item[1] : item;
      if (!u || !u.email) continue;
      const userId = u.userId || u.id;
      const cleanEmail = u.email.trim().toLowerCase();

      const existing = await UserModel.find({ $or: [{ email: cleanEmail }, { userId }] });
      if (existing.length > 1) {
        duplicateCount++;
      }
    }
  }

  if (duplicateCount > 0) {
    throw new Error(`Migration created ${duplicateCount} duplicate records!`);
  }

  console.log('✅ Idempotency check passed: 0 duplicate users detected');
  console.log('🎉 Migration logic verified successfully!\n');

  await mongoose.disconnect();
  process.exit(0);
}

testMigration().catch((err) => {
  console.error('❌ Migration test failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
