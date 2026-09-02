import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  UserModel,
  PlanModel,
  DepositModel,
  WithdrawalModel,
  InvestmentModel,
  TransactionModel,
  NotificationModel,
} from '../models';
import { PLATFORM_DEFAULT_PLANS } from './platform';

export async function connectDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const mongoUri = process.env.MONGODB_URI;
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  if (!mongoUri) {
    if (isProduction) {
      console.error('❌ FATAL: MONGODB_URI environment variable is required in production.');
      throw new Error('FATAL: MONGODB_URI environment variable is missing. ApexBridge requires a valid MongoDB Atlas connection string to start in production.');
    }

    if (isTest) {
      console.log('🧪 NODE_ENV=test detected without MONGODB_URI. Initializing isolated MongoMemoryServer for tests...');
      await startEmbeddedMongo();
    } else {
      // Local development without MONGODB_URI
      console.warn('⚠️ MONGODB_URI not found in local environment. Attempting local MongoDB at mongodb://127.0.0.1:27017/apexbridge...');
      try {
        await mongoose.connect('mongodb://127.0.0.1:27017/apexbridge', {
          serverSelectionTimeoutMS: 3000,
        });
      } catch (localErr) {
        console.warn('Local MongoDB daemon not reachable. Starting isolated MongoMemoryServer for development...');
        await startEmbeddedMongo();
      }
    }
  } else {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000,
      });
    } catch (err: any) {
      console.error('❌ FATAL: Could not connect to MongoDB Atlas with the provided MONGODB_URI.');
      throw new Error(`MongoDB connection failed: ${err?.message || err}`);
    }
  }

  // Safe connection logging (Strictly sanitizes secrets and credentials)
  const dbName = mongoose.connection.name || 'apexbridge';
  const isAtlas = mongoUri ? mongoUri.includes('mongodb.net') : false;
  console.log('-------------------------------------------------------');
  console.log('MongoDB: connected');
  console.log(`Database: ${dbName}`);
  console.log(`Storage: ${isAtlas ? 'MongoDB Atlas' : 'MongoDB'}`);
  console.log('-------------------------------------------------------');

  // Seed default admin, platform plans, and auto-migrate legacy data into MongoDB Atlas
  await seedAdminUser();
  await seedPlatformPlans();
  await autoMigrateLegacyJsonData();

  return mongoose;
}

let embeddedMongod: any = null;

async function startEmbeddedMongo() {
  if (!embeddedMongod) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    embeddedMongod = await MongoMemoryServer.create();
  }
  const uri = embeddedMongod.getUri();
  await mongoose.connect(uri);
}

export async function stopEmbeddedMongo() {
  if (embeddedMongod) {
    const instance = embeddedMongod;
    embeddedMongod = null;
    try {
      await instance.stop({ doCleanup: true, force: true });
    } catch {}
  }
}

export async function seedAdminUser() {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@apexbridge.com').toLowerCase().trim();
    const existingAdmin = await UserModel.findOne({ email: adminEmail });

    if (!existingAdmin) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(adminPassword, salt);
      const adminId = 'usr_admin_001';

      await UserModel.create({
        userId: adminId,
        name: 'ApexBridge Super Admin',
        email: adminEmail,
        passwordHash,
        role: 'admin',
        tier: 'VIP Sovereign Core',
        balance: 100000.0,
        phone: '+1 (800) 555-APEX',
        is2FAEnabled: true,
        currencyPreference: 'USD',
        notifications: {
          email: true,
          sms: true,
          yieldAlerts: true,
        },
        permissions: ['*'],
      });

      console.log(`👑 Super Admin account seeded in MongoDB Atlas: ${adminEmail}`);
    }
  } catch (err) {
    console.error('Error during admin seeding:', err);
  }
}

export async function seedPlatformPlans() {
  try {
    const planCount = await PlanModel.countDocuments();
    if (planCount === 0) {
      for (const p of PLATFORM_DEFAULT_PLANS) {
        await PlanModel.create(p);
      }
      console.log('📋 Default investment plans initialized in MongoDB Atlas');
    }
  } catch (err) {
    console.error('Error during platform plan seeding:', err);
  }
}

export async function autoMigrateLegacyJsonData(): Promise<void> {
  try {
    const dbFilePath = path.join(process.cwd(), 'data', 'db.json');
    if (!fs.existsSync(dbFilePath)) {
      return;
    }

    const raw = fs.readFileSync(dbFilePath, 'utf-8');
    const data = JSON.parse(raw);
    let migratedUsers = 0;

    // Migrate users (preserving exact passwordHash and normalizing email)
    if (Array.isArray(data.users)) {
      for (const item of data.users) {
        const u = Array.isArray(item) ? item[1] : item;
        if (!u || !u.email) continue;

        const userId = u.userId || u.id;
        const cleanEmail = String(u.email).trim().toLowerCase();

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
        }
      }
    }

    if (migratedUsers > 0) {
      console.log(`📦 [MIGRATION] Automatically imported ${migratedUsers} user(s) from legacy store into MongoDB Atlas`);
    }
  } catch (err) {
    console.error('⚠️ [MIGRATION] Error checking legacy data:', err);
  }
}
