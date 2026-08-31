import { Router, Response } from 'express';
import { db } from '../store/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { UserInvestment, TransactionLedgerItem } from '../types';

const router = Router();

// GET /api/v1/investments/plans
router.get('/plans', (_req, res: Response): void => {
  res.status(200).json({
    plans: Array.from(db.investmentPlans.values()),
  });
});

// GET /api/v1/investments
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const userInvs = Array.from(db.userInvestments.values())
    .filter((inv) => inv.userId === user.id)
    .map((inv) => ({
      id: inv.id,
      planName: inv.planName,
      amount: inv.amount,
      roi: inv.roi,
      progress: inv.progress,
      projectedReturn: inv.projectedReturn,
      status: inv.status,
      startDate: inv.startDate,
      maturityDate: inv.maturityDate,
    }));

  res.status(200).json({
    investments: userInvs,
  });
});

// POST /api/v1/investments
router.post('/', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { planId, planName, amount, roi } = req.body;

  const invAmount = Number(amount);
  if (!invAmount || invAmount <= 0) {
    res.status(400).json({ success: false, message: 'Valid investment amount is required' });
    return;
  }

  // Deduct from balance
  if (user.balance < invAmount) {
    res.status(400).json({ success: false, message: 'Insufficient balance for investment' });
    return;
  }

  user.balance -= invAmount;

  const resolvedPlan = planId ? db.investmentPlans.get(planId) : undefined;
  const finalPlanName = planName || (resolvedPlan ? resolvedPlan.name : 'Apex Starter Tier');
  const finalRoi = roi || (resolvedPlan ? resolvedPlan.roi : '15%');
  const durationDays = resolvedPlan ? resolvedPlan.durationDays : 7;

  const invId = `inv_${Math.floor(1000 + Math.random() * 9000)}`;
  const startDate = new Date().toISOString();
  const maturityDateObj = new Date();
  maturityDateObj.setDate(maturityDateObj.getDate() + durationDays);

  const roiPercent = parseFloat(finalRoi.replace('%', '')) || 15;
  const projectedReturn = Number((invAmount * (1 + roiPercent / 100)).toFixed(2));

  const newInvestment: UserInvestment = {
    id: invId,
    userId: user.id,
    planId: planId || 'starter',
    planName: finalPlanName,
    amount: invAmount,
    roi: finalRoi,
    progress: 0,
    projectedReturn,
    status: 'active',
    startDate,
    maturityDate: maturityDateObj.toISOString(),
  };

  db.userInvestments.set(invId, newInvestment);

  // Add to ledger
  const ledgerItem: TransactionLedgerItem = {
    id: `tx_${Math.floor(10000 + Math.random() * 90000)}`,
    userId: user.id,
    type: 'investment',
    amount: invAmount,
    status: 'approved',
    plan: finalPlanName,
    date: startDate,
  };
  db.transactions.unshift(ledgerItem);

  const availableBalance = user.balance >= 35800 ? user.balance - 35800 : user.balance;

  res.status(201).json({
    success: true,
    investment: {
      id: newInvestment.id,
      planName: newInvestment.planName,
      amount: newInvestment.amount,
      roi: newInvestment.roi,
      status: newInvestment.status,
      startDate: newInvestment.startDate,
    },
    newAvailableBalance: Number(availableBalance.toFixed(2)),
  });
});

// POST /api/v1/investments/:id/settle
router.post('/:id/settle', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const id = req.params.id as string;

  const inv = db.userInvestments.get(id);
  if (!inv) {
    res.status(404).json({ success: false, message: 'Investment position not found' });
    return;
  }

  if (inv.userId !== user.id) {
    res.status(403).json({ success: false, message: 'Unauthorized access to this investment' });
    return;
  }

  const payoutAmount = inv.projectedReturn || inv.amount * 1.15;
  inv.status = 'settled';
  inv.progress = 100;
  user.balance += payoutAmount;

  const txId = `tx_settle_${Math.floor(10000 + Math.random() * 90000)}`;

  // Add settlement to ledger
  const ledgerItem: TransactionLedgerItem = {
    id: txId,
    userId: user.id,
    type: 'investment',
    amount: payoutAmount,
    status: 'completed',
    plan: `${inv.planName} Settlement`,
    date: new Date().toISOString(),
  };
  db.transactions.unshift(ledgerItem);

  res.status(200).json({
    success: true,
    settlement: {
      investmentId: inv.id,
      payoutAmount: Number(payoutAmount.toFixed(2)),
      creditedBalance: Number(user.balance.toFixed(2)),
      transactionId: txId,
      status: 'completed',
    },
  });
});

export default router;
