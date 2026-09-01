import mongoose, { Schema, Document } from 'mongoose';

export interface IWithdrawalDocument extends Document {
  withdrawalId: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: string;
  amount: number;
  fee: number;
  netPayout: number;
  method: string;
  destinationAddress: string;
  status: 'pending' | 'processed' | 'rejected';
  txHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalSchema = new Schema<IWithdrawalDocument>(
  {
    withdrawalId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, default: '' },
    userEmail: { type: String, default: '' },
    type: { type: String, default: 'withdrawal' },
    amount: { type: Number, required: true },
    fee: { type: Number, default: 15.0 },
    netPayout: { type: Number, required: true },
    method: { type: String, default: 'btc' },
    destinationAddress: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processed', 'rejected'], default: 'pending' },
    txHash: { type: String, default: '' },
  },
  { timestamps: true }
);

export const WithdrawalModel = mongoose.models.Withdrawal || mongoose.model<IWithdrawalDocument>('Withdrawal', WithdrawalSchema);
