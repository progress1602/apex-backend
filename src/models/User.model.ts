import mongoose, { Schema, Document } from 'mongoose';

export interface IUserDocument extends Document {
  userId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'investor' | 'admin' | 'sub-admin';
  tier: string;
  avatar: string;
  balance: number;
  phone: string;
  is2FAEnabled: boolean;
  currencyPreference: string;
  notifications: {
    email: boolean;
    sms: boolean;
    yieldAlerts: boolean;
  };
  permissions?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDocument>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: 'Investor' },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['investor', 'admin', 'sub-admin'], default: 'investor' },
    tier: { type: String, default: 'Tier 1 - Standard' },
    avatar: { type: String, default: '' },
    balance: { type: Number, default: 0.0 },
    phone: { type: String, default: '' },
    is2FAEnabled: { type: Boolean, default: false },
    currencyPreference: { type: String, default: 'USD' },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      yieldAlerts: { type: Boolean, default: false },
    },
    permissions: [{ type: String }],
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);
