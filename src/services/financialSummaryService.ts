import mongoose from 'mongoose';
import { UserModel, DepositModel, InvestmentModel } from '../models';
import { checkAndSettleMaturedInvestments } from './settlementService';

export interface UserFinancialSummary {
  totalDeposit: number;
  totalDeposits: number;
  totalProfits: number;
  totalProfit: number;
  totalEarnings: number;
  totalBalance: number;
  totalAmount: number;
  availableBalance: number;
  activeInvestments: number;
  totalPortfolio: number;
}

/**
 * Calculates user's financial overview:
 * - totalDeposit: only approved deposits made by the user
 * - totalProfits: all gains/profits from completed or settled investments under the user
 * - totalBalance: combination of totalDeposit + totalProfits
 * - availableBalance: current real-time available wallet balance in UserModel
 */
export async function calculateUserFinancialSummary(userIdentifier: string): Promise<UserFinancialSummary> {
  const cleanId = String(userIdentifier || '').trim();
  if (!cleanId) {
    return {
      totalDeposit: 0,
      totalDeposits: 0,
      totalProfits: 0,
      totalProfit: 0,
      totalEarnings: 0,
      totalBalance: 0,
      totalAmount: 0,
      availableBalance: 0,
      activeInvestments: 0,
      totalPortfolio: 0,
    };
  }

  // 1. Resolve canonical user record
  const initialUser = await UserModel.findOne({
    $or: [
      { userId: cleanId },
      ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
      { email: cleanId.toLowerCase() },
    ],
  });

  if (!initialUser) {
    return {
      totalDeposit: 0,
      totalDeposits: 0,
      totalProfits: 0,
      totalProfit: 0,
      totalEarnings: 0,
      totalBalance: 0,
      totalAmount: 0,
      availableBalance: 0,
      activeInvestments: 0,
      totalPortfolio: 0,
    };
  }

  const canonicalUserId = initialUser.userId;
  const canonicalEmail = initialUser.email;

  // 2. Ensure any matured or completed investments are settled and credited to balance
  try {
    await checkAndSettleMaturedInvestments(canonicalUserId);
  } catch (err) {
    // Continue
  }

  // 3. Fetch fresh user, deposits, and investments in parallel
  const [freshUser, deposits, investments] = await Promise.all([
    UserModel.findOne({ userId: canonicalUserId }),
    DepositModel.find({
      $or: [
        { userId: canonicalUserId },
        { userEmail: canonicalEmail },
      ],
    }),
    InvestmentModel.find({
      $or: [
        { userId: canonicalUserId },
        { userEmail: canonicalEmail },
      ],
    }),
  ]);

  // 4. Calculate total deposit made by the user (ONLY approved or completed deposits)
  let approvedDepositSum = 0;
  for (const dep of deposits) {
    const status = String(dep.status || '').toLowerCase().trim();
    if (status === 'approved' || status === 'completed') {
      const amt = Number(dep.amount) || 0;
      if (amt > 0) {
        approvedDepositSum += amt;
      }
    }
  }
  const totalDeposit = Number(approvedDepositSum.toFixed(2));

  // 5. Calculate total profits (gain gotten from all completed or settled investments under user)
  let totalProfitsSum = 0;
  let activeInvestmentsSum = 0;

  for (const inv of investments) {
    const status = String(inv.status || '').toLowerCase().trim();
    const principal = Number(inv.amount) || 0;
    const progress = Number(inv.progress || 0);

    if (status === 'settled' || status === 'completed' || progress >= 100) {
      let gain = 0;
      if (typeof inv.projectedReturn === 'number' && inv.projectedReturn > principal) {
        gain = inv.projectedReturn - principal;
      } else {
        const roiPercent = parseFloat(String(inv.roi || '0').replace('%', '')) || 0;
        const projectedReturn = Number((principal * (1 + roiPercent / 100)).toFixed(2));
        gain = Math.max(0, projectedReturn - principal);
      }
      totalProfitsSum += Math.max(0, gain);
    } else if (status === 'active') {
      activeInvestmentsSum += principal;
    }
  }

  const totalProfits = Number(totalProfitsSum.toFixed(2));

  // 6. Total Balance is strictly the combination of total deposits and total profits
  const totalBalance = Number((totalDeposit + totalProfits).toFixed(2));

  // 7. Balance is the real-time available spendable funds in the user's wallet
  const availableBalance = freshUser ? Number((freshUser.balance || 0).toFixed(2)) : 0;
  const activeInvestments = Number(activeInvestmentsSum.toFixed(2));
  const totalPortfolio = Number((availableBalance + activeInvestments).toFixed(2));

  // 8. Synchronize computed fields to UserModel
  if (freshUser) {
    UserModel.updateOne(
      { userId: canonicalUserId },
      {
        $set: {
          totalDeposit,
          totalProfits,
          totalBalance,
        },
      }
    ).catch(() => {});
  }

  return {
    totalDeposit,
    totalDeposits: totalDeposit,
    totalProfits,
    totalProfit: totalProfits,
    totalEarnings: totalProfits,
    totalBalance,
    totalAmount: totalBalance,
    availableBalance,
    activeInvestments,
    totalPortfolio,
  };
}
