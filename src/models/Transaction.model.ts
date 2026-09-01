import mongoose, { Schema, Document } from 'mongoose';

export interface ITransactionDocument extends Document {
  transactionId: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'investment';
  amount: number;
  status: string;
  plan: string;
  receiptImage?: string;
  date: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransactionDocument>(
  {
    transactionId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, default: 'pending' },
    plan: { type: String, default: '' },
    receiptImage: { type: String, default: '' },
    date: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true }
);

export const TransactionModel = mongoose.models.Transaction || mongoose.model<ITransactionDocument>('Transaction', TransactionSchema);
