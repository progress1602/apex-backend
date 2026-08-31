import { Router, Request, Response } from 'express';
import { db } from '../store/db';

const router = Router();

// PATCH /api/v1/admin/deposits/:id/status
router.patch('/deposits/:id/status', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const { status } = req.body;

  const validStatuses = ['pending', 'approved', 'rejected'];
  if (!status || !validStatuses.includes(status.toLowerCase())) {
    res.status(400).json({ success: false, message: 'Valid status (pending | approved | rejected) is required' });
    return;
  }

  const deposit = db.depositTransactions.get(id);
  if (deposit) {
    const prevStatus = deposit.status;
    deposit.status = status.toLowerCase() as 'pending' | 'approved' | 'rejected';

    // If newly approved, credit the user balance
    if (prevStatus !== 'approved' && deposit.status === 'approved') {
      const user = db.users.get(deposit.userId);
      if (user) {
        user.balance += deposit.amount;
      }
    }

    // Update in ledger
    const ledger = db.transactions.find((tx) => tx.id === id);
    if (ledger) {
      ledger.status = deposit.status;
    }
  }

  // Also check direct ledger if deposit transaction wasn't in map
  const directLedger = db.transactions.find((tx) => tx.id === id && tx.type === 'deposit');
  if (directLedger) {
    directLedger.status = status.toLowerCase() as 'pending' | 'approved' | 'rejected';
  }

  res.status(200).json({
    success: true,
    transactionId: id,
    status: status.toLowerCase(),
  });
});

// PATCH /api/v1/admin/withdrawals/:id/status
router.patch('/withdrawals/:id/status', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const { status, txHash } = req.body;

  const validStatuses = ['pending', 'processed', 'approved', 'rejected'];
  if (!status || !validStatuses.includes(status.toLowerCase())) {
    res.status(400).json({ success: false, message: 'Valid status (pending | processed | approved | rejected) is required' });
    return;
  }

  const withdrawal = db.withdrawalTransactions.get(id);
  if (withdrawal) {
    withdrawal.status = status.toLowerCase() as 'pending' | 'processed' | 'rejected';
    if (txHash) {
      withdrawal.txHash = txHash;
    }

    // If rejected, refund balance to user
    if (withdrawal.status === 'rejected') {
      const user = db.users.get(withdrawal.userId);
      if (user) {
        user.balance += withdrawal.amount;
      }
    }

    // Update in ledger
    const ledger = db.transactions.find((tx) => tx.id === id);
    if (ledger) {
      ledger.status = withdrawal.status;
    }
  }

  const directLedger = db.transactions.find((tx) => tx.id === id && tx.type === 'withdrawal');
  if (directLedger) {
    directLedger.status = status.toLowerCase() as any;
  }

  res.status(200).json({
    success: true,
    transactionId: id,
    status: status.toLowerCase(),
  });
});

// PUT /api/v1/admin/plans/:id
router.put('/plans/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const { roi, minAmount, maxAmount, feeRate, name, durationDays, status } = req.body;

  let plan = db.investmentPlans.get(id);
  if (!plan) {
    // Create or update plan
    plan = {
      id,
      name: name || `Apex Plan ${id.toUpperCase()}`,
      roi: roi || '15%',
      durationDays: durationDays || 7,
      minAmount: minAmount || 500,
      maxAmount: maxAmount || 10000,
      feeRate: feeRate || 0.1,
      status: status || 'active',
    };
    db.investmentPlans.set(id, plan);
  } else {
    if (roi !== undefined) plan.roi = roi;
    if (minAmount !== undefined) plan.minAmount = Number(minAmount);
    if (maxAmount !== undefined) plan.maxAmount = Number(maxAmount);
    if (feeRate !== undefined) plan.feeRate = Number(feeRate);
    if (name !== undefined) plan.name = name;
    if (durationDays !== undefined) plan.durationDays = Number(durationDays);
    if (status !== undefined) plan.status = status;
  }

  res.status(200).json({
    success: true,
    message: 'Plan configuration updated',
  });
});

export default router;
