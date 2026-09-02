import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { UserModel, InvestmentModel, PlanModel, TransactionModel } from '../models';

const router = Router();

// GET /api/v1/investments/plans
router.get('/plans', async (_req, res: Response): Promise<void> => {
  try {
    const plans = await PlanModel.find({ status: 'active' });
    const formatted = plans.map((p) => ({
      id: p.planId,
      name: p.name,
      roi: p.roi,
      durationDays: p.durationDays,
      minAmount: p.minAmount,
      maxAmount: p.maxAmount,
      feeRate: p.feeRate,
      status: p.status,
    }));
    res.status(200).json({ plans: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching plans' });
  }
});

// GET /api/v1/investments
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const userInvs = await InvestmentModel.find({ userId: user.userId }).sort({ createdAt: -1 });

    const formatted = userInvs.map((inv) => ({
      id: inv.investmentId,
      planName: inv.planName,
      amount: inv.amount,
      roi: inv.roi,
      progress: inv.progress,
      projectedReturn: inv.projectedReturn,
      status: inv.status,
      startDate: inv.startDate.toISOString(),
      maturityDate: inv.maturityDate.toISOString(),
    }));

    res.status(200).json({ investments: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching investments' });
  }
});

// POST /api/v1/investments
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { planId, planName, amount, roi } = req.body;

    const invAmount = Number(amount);
    if (!invAmount || invAmount <= 0) {
      res.status(400).json({ success: false, message: 'Valid investment amount is required' });
      return;
    }

    // Atomically check and deduct user balance to prevent race conditions
    const updatedUser = await UserModel.findOneAndUpdate(
      { userId: user.userId, balance: { $gte: invAmount } },
      { $inc: { balance: -invAmount } },
      { new: true }
    );

    if (!updatedUser) {
      res.status(400).json({ success: false, message: 'Insufficient balance for investment' });
      return;
    }

    const resolvedPlan = planId ? await PlanModel.findOne({ planId }) : null;
    const finalPlanName = planName || (resolvedPlan ? resolvedPlan.name : 'Apex Starter Tier');
    const finalRoi = roi || (resolvedPlan ? resolvedPlan.roi : '15%');
    const durationDays = resolvedPlan ? resolvedPlan.durationDays : 7;

    const invId = `inv_${Math.floor(1000 + Math.random() * 9000)}`;
    const startDate = new Date();
    const maturityDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const roiPercent = parseFloat(finalRoi.replace('%', '')) || 15;
    const projectedReturn = Number((invAmount * (1 + roiPercent / 100)).toFixed(2));

    // Persist to MongoDB InvestmentModel
    const newInvestment = await InvestmentModel.create({
      investmentId: invId,
      userId: user.userId,
      planId: planId || 'starter',
      planName: finalPlanName,
      amount: invAmount,
      roi: finalRoi,
      progress: 0,
      projectedReturn,
      status: 'active',
      startDate,
      maturityDate,
    });

    const txId = `tx_${Math.floor(10000 + Math.random() * 90000)}`;
    // Persist to MongoDB TransactionModel
    await TransactionModel.create({
      transactionId: txId,
      userId: user.userId,
      type: 'investment',
      amount: invAmount,
      status: 'approved',
      plan: finalPlanName,
      date: startDate.toISOString(),
    });

    res.status(201).json({
      success: true,
      investment: {
        id: newInvestment.investmentId,
        planName: newInvestment.planName,
        amount: newInvestment.amount,
        roi: newInvestment.roi,
        status: newInvestment.status,
        startDate: newInvestment.startDate.toISOString(),
      },
      newAvailableBalance: Number(updatedUser.balance.toFixed(2)),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error creating investment' });
  }
});

// POST /api/v1/investments/:id/settle
router.post('/:id/settle', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const id = req.params.id as string;

    const inv = await InvestmentModel.findOne({ investmentId: id, userId: user.userId });
    if (!inv) {
      res.status(404).json({ success: false, message: 'Investment position not found' });
      return;
    }

    if (inv.status === 'settled') {
      res.status(400).json({ success: false, message: 'Investment position has already been settled' });
      return;
    }

    const payoutAmount = inv.projectedReturn || Number((inv.amount * 1.15).toFixed(2));

    // Update investment status in MongoDB
    inv.status = 'settled';
    inv.progress = 100;
    await inv.save();

    // Atomically credit user balance in MongoDB
    const updatedUser = await UserModel.findOneAndUpdate(
      { userId: user.userId },
      { $inc: { balance: payoutAmount } },
      { new: true }
    );

    const txId = `tx_settle_${Math.floor(10000 + Math.random() * 90000)}`;
    const nowIso = new Date().toISOString();

    // Persist settlement transaction to MongoDB
    await TransactionModel.create({
      transactionId: txId,
      userId: user.userId,
      type: 'investment',
      amount: payoutAmount,
      status: 'completed',
      plan: `${inv.planName} Settlement`,
      date: nowIso,
    });

    res.status(200).json({
      success: true,
      settlement: {
        investmentId: inv.investmentId,
        payoutAmount: Number(payoutAmount.toFixed(2)),
        creditedBalance: Number(updatedUser?.balance.toFixed(2) || 0),
        transactionId: txId,
        status: 'completed',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error settling investment' });
  }
});

export default router;
