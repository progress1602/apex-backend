import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User.model';
import { db } from '../store/db';
import { User } from '../types';

export async function connectDatabase(): Promise<typeof mongoose> {
  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri) {
    try {
      console.log('Connecting to MongoDB via MONGODB_URI...');
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('✅ Connected to MongoDB successfully!');
    } catch (err) {
      console.warn('⚠️ Direct MongoDB connection failed, starting embedded MongoDB instance...', err);
      await startEmbeddedMongo();
    }
  } else {
    console.log('ℹ️ No MONGODB_URI provided in environment. Starting embedded MongoDB instance...');
    await startEmbeddedMongo();
  }

  // Seed Admin and sync existing documents into in-memory store
  await seedAdminUser();
  await syncMongooseToStore();

  return mongoose;
}

async function startEmbeddedMongo() {
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log(`✅ Embedded MongoDB running and connected at ${uri}`);
  } catch (e) {
    console.error('Failed to start embedded MongoDB:', e);
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

      const adminUser = await UserModel.create({
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

      console.log(`👑 Seeded default Super Admin user: ${adminEmail} / ${adminPassword}`);

      // Add to store
      const userObj: User = {
        id: adminUser.userId,
        name: adminUser.name,
        email: adminUser.email,
        passwordHash: adminUser.passwordHash,
        role: 'admin',
        tier: adminUser.tier,
        balance: adminUser.balance,
        phone: adminUser.phone,
        is2FAEnabled: adminUser.is2FAEnabled,
        currencyPreference: adminUser.currencyPreference,
        notifications: adminUser.notifications,
        createdAt: adminUser.createdAt.toISOString(),
      };
      db.users.set(userObj.id, userObj);
    } else {
      console.log(`👑 Admin user already present in MongoDB: ${adminEmail}`);
      const userObj: User = {
        id: existingAdmin.userId,
        name: existingAdmin.name,
        email: existingAdmin.email,
        passwordHash: existingAdmin.passwordHash,
        role: existingAdmin.role as any,
        tier: existingAdmin.tier,
        balance: existingAdmin.balance,
        phone: existingAdmin.phone,
        is2FAEnabled: existingAdmin.is2FAEnabled,
        currencyPreference: existingAdmin.currencyPreference,
        notifications: existingAdmin.notifications,
        createdAt: existingAdmin.createdAt.toISOString(),
      };
      db.users.set(userObj.id, userObj);
    }
  } catch (err) {
    console.error('Error during admin seeding:', err);
  }
}

export async function syncMongooseToStore() {
  try {
    const users = await UserModel.find();
    for (const u of users) {
      db.users.set(u.userId, {
        id: u.userId,
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        role: u.role as any,
        tier: u.tier,
        balance: u.balance,
        phone: u.phone,
        is2FAEnabled: u.is2FAEnabled,
        currencyPreference: u.currencyPreference,
        notifications: u.notifications,
        createdAt: u.createdAt.toISOString(),
      });
    }
    console.log(`📦 Synchronized ${users.length} users from MongoDB to active cache`);
  } catch (err) {
    console.error('Error syncing MongoDB to store:', err);
  }
}
