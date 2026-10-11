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
 * - totalDeposit: all deposits made by the user
 * - totalProfits: total profit earned from platform investments
 * - totalBalance: totalDeposit + totalProfits (total amount)
 * - availableBalance: current spendable balance in UserModel
 */
export async function calculateUserFinancialSummary(userId: string): Promise<UserFinancialSummary> {
  // 1. Ensure any matured investments are settled first
  try {
    await checkAndSettleMaturedInvestments(userId);
  } catch (err) {
    // Continue if settlement check catches an error
  }

  // 2. Fetch user, deposits, and investments in parallel
  const [user, deposits, investments] = await Promise.all([
    UserModel.findOne({ userId }),
    DepositModel.find({ userId }),
    InvestmentModel.find({ userId }),
  ]);

  // 3. Calculate total deposit made by the user
  let approvedDepositSum = 0;
  let nonRejectedDepositSum = 0;

  for (const dep of deposits) {
    const amt = Number(dep.amount) || 0;
    if (dep.status === 'approved' || dep.status === 'completed') {
      approvedDepositSum += amt;
    }
    if (dep.status !== 'rejected') {
      nonRejectedDepositSum += amt;
    }
  }

  // Use approved deposits; fall back to non-rejected if no deposits have been approved yet
  const rawDepositVal = approvedDepositSum > 0 ? approvedDepositSum : nonRejectedDepositSum;
  const totalDeposit = Number(rawDepositVal.toFixed(2));

  // 4. Calculate total profits earned from platform investments
  let totalProfitsSum = 0;
  let activeInvestmentsSum = 0;

  for (const inv of investments) {
    if (inv.status === 'settled' || inv.status === 'completed') {
      const roiPercent = parseFloat(String(inv.roi || '15').replace('%', '')) || 15;
      const projectedReturn = inv.projectedReturn > 0
        ? inv.projectedReturn
        : Number((inv.amount * (1 + roiPercent / 100)).toFixed(2));
      const profit = Math.max(0, projectedReturn - inv.amount);
      totalProfitsSum += profit;
    } else if (inv.status === 'active') {
      activeInvestmentsSum += Number(inv.amount) || 0;
    }
  }

  const totalProfits = Number(totalProfitsSum.toFixed(2));

  // 5. Total amount is the total of the deposit and the total profit
  const totalBalance = Number((totalDeposit + totalProfits).toFixed(2));

  const availableBalance = user ? Number((user.balance || 0).toFixed(2)) : 0;
  const activeInvestments = Number(activeInvestmentsSum.toFixed(2));
  const totalPortfolio = Number((availableBalance + activeInvestments).toFixed(2));

  // 6. Asynchronously sync computed summary to UserModel
  if (user) {
    UserModel.updateOne(
      { userId },
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
