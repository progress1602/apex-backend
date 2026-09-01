import mongoose, { Schema, Document } from 'mongoose';

export interface IInvestmentDocument extends Document {
  investmentId: string;
  userId: string;
  planId: string;
  planName: string;
  amount: number;
  roi: string;
  progress: number;
  projectedReturn: number;
  status: 'active' | 'completed' | 'settled';
  startDate: Date;
  maturityDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvestmentSchema = new Schema<IInvestmentDocument>(
  {
    investmentId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    planId: { type: String, default: 'starter' },
    planName: { type: String, required: true },
    amount: { type: Number, required: true },
    roi: { type: String, default: '15%' },
    progress: { type: Number, default: 0 },
    projectedReturn: { type: Number, required: true },
    status: { type: String, enum: ['active', 'completed', 'settled'], default: 'active' },
    startDate: { type: Date, default: Date.now },
    maturityDate: { type: Date, required: true },
  },
  { timestamps: true }
);

export const InvestmentModel = mongoose.models.Investment || mongoose.model<IInvestmentDocument>('Investment', InvestmentSchema);
