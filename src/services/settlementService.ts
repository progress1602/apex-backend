import mongoose from 'mongoose';
import {
  UserModel,
  InvestmentModel,
  TransactionModel,
  NotificationModel,
} from '../models';

export interface SettleResult {
  settled: boolean;
  investmentId: string;
  userId: string;
  payoutAmount: number;
  newBalance?: number;
  reason?: string;
}

/**
 * Atomically settles a single investment and credits the payout amount to the user balance.
 * Uses atomic conditional update ({ status: { $ne: 'settled' } }) to prevent any double-credit race condition.
 */
export async function settleInvestmentById(investmentId: string): Promise<SettleResult> {
  try {
    const invQuery: any = { status: { $ne: 'settled' } };
    if (mongoose.isValidObjectId(investmentId)) {
      invQuery.$or = [{ investmentId }, { _id: investmentId }];
    } else {
      invQuery.investmentId = investmentId;
    }

    // 1. Atomically transition status from active/completed -> settled
    const settledInv = await InvestmentModel.findOneAndUpdate(
      invQuery,
      {
        $set: {
          status: 'settled',
          progress: 100,
        },
      },
      { new: true }
    );

    if (!settledInv) {
      return {
        settled: false,
        investmentId,
        userId: '',
        payoutAmount: 0,
        reason: 'Investment is already settled or does not exist',
      };
    }

    // 2. Calculate supposed payout amount (principal + ROI yield)
    const roiPercent = parseFloat(String(settledInv.roi || '15').replace('%', '')) || 15;
    const computedReturn = Number((settledInv.amount * (1 + roiPercent / 100)).toFixed(2));
    const payoutAmount = settledInv.projectedReturn > 0 ? settledInv.projectedReturn : computedReturn;

    // 3. Atomically credit the payout amount to user's MongoDB balance
    const userQuery: any = mongoose.isValidObjectId(settledInv.userId)
      ? { $or: [{ userId: settledInv.userId }, { _id: settledInv.userId }] }
      : { userId: settledInv.userId };

    const updatedUser = await UserModel.findOneAndUpdate(
      userQuery,
      { $inc: { balance: payoutAmount } },
      { new: true }
    );

    const nowIso = new Date().toISOString();
    const txId = `tx_settle_${settledInv.investmentId}_${Date.now()}`;

    // 4. Record settlement transaction in TransactionModel
    await TransactionModel.create({
      transactionId: txId,
      userId: settledInv.userId,
      type: 'investment',
      amount: payoutAmount,
      status: 'completed',
      plan: `${settledInv.planName} Auto-Settlement`,
      date: nowIso,
    });

    // 5. Create notification for user
    await NotificationModel.create({
      notificationId: `notif_${Math.floor(1000000 + Math.random() * 9000000)}`,
      userId: settledInv.userId,
      title: 'Investment Matured & Settled',
      message: `Your position in ${settledInv.planName} has matured! $${payoutAmount.toFixed(2)} has been credited to your available balance.`,
      type: 'investment',
      priority: 'Standard Information',
      isRead: false,
    });

    console.log(
      `⚡ [AUTO-SETTLE] Investment '${settledInv.investmentId}' matured: credited $${payoutAmount} to user '${settledInv.userId}'. New balance: $${updatedUser?.balance}`
    );

    return {
      settled: true,
      investmentId: settledInv.investmentId,
      userId: settledInv.userId,
      payoutAmount,
      newBalance: updatedUser ? Number(updatedUser.balance.toFixed(2)) : undefined,
    };
  } catch (err: any) {
    console.error(`❌ Error settling investment ${investmentId}:`, err);
    return {
      settled: false,
      investmentId,
      userId: '',
      payoutAmount: 0,
      reason: err.message,
    };
  }
}

/**
 * Checks all investments that reached their maturity date (now >= maturityDate)
 * and automatically settles them. If userId is provided, checks for that specific user.
 */
export async function checkAndSettleMaturedInvestments(userId?: string): Promise<SettleResult[]> {
  try {
    const now = new Date();
    const filter: any = {
      maturityDate: { $lte: now },
      status: { $ne: 'settled' },
    };

    if (userId) {
      filter.userId = userId;
    }

    const maturedInvs = await InvestmentModel.find(filter);
    if (!maturedInvs || maturedInvs.length === 0) {
      return [];
    }

    const results: SettleResult[] = [];
    for (const inv of maturedInvs) {
      const res = await settleInvestmentById(inv.investmentId);
      if (res.settled) {
        results.push(res);
      }
    }

    return results;
  } catch (err) {
    console.error('Error during auto-settlement check:', err);
    return [];
  }
}

let autoSettleIntervalTimer: NodeJS.Timeout | null = null;

/**
 * Starts the background auto-settlement worker that checks for matured investments periodically.
 */
export function startAutoSettlementWorker(intervalMs: number = 30000): void {
  if (autoSettleIntervalTimer) return;

  // Run initial check on startup
  checkAndSettleMaturedInvestments().catch(() => {});

  autoSettleIntervalTimer = setInterval(() => {
    checkAndSettleMaturedInvestments().catch(() => {});
  }, intervalMs);

  // Allow Node process to exit gracefully if this timer is active
  if (autoSettleIntervalTimer.unref) {
    autoSettleIntervalTimer.unref();
  }
}

/**
 * Stops the background auto-settlement worker (useful in test teardown).
 */
export function stopAutoSettlementWorker(): void {
  if (autoSettleIntervalTimer) {
    clearInterval(autoSettleIntervalTimer);
    autoSettleIntervalTimer = null;
  }
}
