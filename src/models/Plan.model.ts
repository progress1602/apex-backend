import mongoose, { Schema, Document } from 'mongoose';

export interface IPlanDocument extends Document {
  planId: string;
  name: string;
  roi: string;
  durationDays: number;
  minAmount: number;
  maxAmount: number;
  feeRate: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new Schema<IPlanDocument>(
  {
    planId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    roi: { type: String, required: true },
    durationDays: { type: Number, default: 7 },
    minAmount: { type: Number, required: true },
    maxAmount: { type: Number, required: true },
    feeRate: { type: Number, default: 0.1 },
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },
  },
  { timestamps: true }
);

export const PlanModel = mongoose.models.Plan || mongoose.model<IPlanDocument>('Plan', PlanSchema);
