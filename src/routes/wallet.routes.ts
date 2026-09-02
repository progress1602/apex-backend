import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { UserModel, InvestmentModel } from '../models';
import { PLATFORM_MARKET_TICKERS, generateChartData } from '../config/platform';

const router = Router();

// GET /api/v1/wallet/summary
router.get('/wallet/summary', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findOne({ userId: req.user!.userId });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const investments = await InvestmentModel.find({ userId: user.userId });

    let activeInvestmentsSum = 0;
    let totalEarnings = 0;

    for (const inv of investments) {
      if (inv.status === 'active') {
        activeInvestmentsSum += inv.amount;
      }
      if (inv.status === 'settled') {
        totalEarnings += Math.max(0, inv.projectedReturn - inv.amount);
      }
    }

    const availableBalance = user.balance;
    const totalPortfolio = availableBalance + activeInvestmentsSum;

    res.status(200).json({
      success: true,
      data: {
        totalPortfolio: Number(totalPortfolio.toFixed(2)),
        availableBalance: Number(availableBalance.toFixed(2)),
        activeInvestments: Number(activeInvestmentsSum.toFixed(2)),
        totalEarnings: Number(totalEarnings.toFixed(2)),
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
