import { Router, Request, Response } from 'express';
import { db } from '../store/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/wallet/summary
router.get('/wallet/summary', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;

  // Calculate user active investments
  let activeInvestmentsSum = 0;
  let totalEarnings = 0;

  for (const inv of db.userInvestments.values()) {
    if (inv.userId === user.id) {
      if (inv.status === 'active') {
        activeInvestmentsSum += inv.amount;
      }
      if (inv.status === 'settled') {
        totalEarnings += Math.max(0, inv.projectedReturn - inv.amount);
      }
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
});

// GET /api/v1/analytics/chart?period=1D|1W|1M|1Y|ALL
router.get('/analytics/chart', (req: Request, res: Response): void => {
  const period = (req.query.period as string) || '1M';
  const data = db.getChartData(period, 0);

  res.status(200).json({
    success: true,
    data,
  });
});

// GET /api/v1/market/tickers
router.get('/market/tickers', (_req: Request, res: Response): void => {
  res.status(200).json({
    tickers: db.marketTickers,
  });
});

export default router;
