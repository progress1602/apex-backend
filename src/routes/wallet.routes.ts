import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { UserModel, InvestmentModel } from '../models';
import { PLATFORM_MARKET_TICKERS, generateChartData } from '../config/platform';
import { checkAndSettleMaturedInvestments } from '../services/settlementService';
import { calculateUserFinancialSummary } from '../services/financialSummaryService';

const router = Router();

// GET /api/v1/wallet/summary
router.get('/wallet/summary', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const summary = await calculateUserFinancialSummary(req.user!.userId);
    const user = await UserModel.findOne({ userId: req.user!.userId });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        totalPortfolio: summary.totalPortfolio,
        availableBalance: summary.availableBalance,
        activeInvestments: summary.activeInvestments,
        totalEarnings: summary.totalProfits,
        totalDeposit: summary.totalDeposit,
        totalDeposits: summary.totalDeposits,
        totalProfits: summary.totalProfits,
        totalProfit: summary.totalProfit,
        totalBalance: summary.totalBalance,
        totalAmount: summary.totalAmount,
        growth24h: 0.0,
        currency: user.currencyPreference || 'USD',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error calculating wallet summary' });
  }
});

// GET /api/v1/analytics/chart?period=1D|1W|1M|1Y|ALL
router.get('/analytics/chart', async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || '1M';
  const data = generateChartData(period, 0);

  res.status(200).json({
    success: true,
    data,
  });
});

// GET /api/v1/market/tickers
router.get('/market/tickers', (_req: Request, res: Response): void => {
  res.status(200).json({
    tickers: PLATFORM_MARKET_TICKERS,
  });
});

export default router;
