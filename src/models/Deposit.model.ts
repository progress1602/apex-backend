import mongoose, { Schema, Document } from 'mongoose';

export interface IDepositDocument extends Document {
  depositId: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: string;
  amount: number;
  method: string;
  currency: string;
  transactionHash: string;
  receiptImage: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const DepositSchema = new Schema<IDepositDocument>(
  {
    depositId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, default: '' },
    userEmail: { type: String, default: '' },
    type: { type: String, default: 'deposit' },
    amount: { type: Number, required: true },
    method: { type: String, required: true },
    currency: { type: String, default: 'USD' },
    transactionHash: { type: String, default: '' },
    receiptImage: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

export const DepositModel = mongoose.models.Deposit || mongoose.model<IDepositDocument>('Deposit', DepositSchema);
