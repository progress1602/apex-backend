import { Router, Response } from 'express';
import { db } from '../store/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { WithdrawalTransaction, TransactionLedgerItem } from '../types';

const router = Router();

// POST /api/v1/withdrawals
router.post('/', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { amount, method, destinationAddress, twoFactorCode } = req.body;

  const wdrAmount = Number(amount);
  if (!wdrAmount || wdrAmount <= 0) {
    res.status(400).json({ success: false, message: 'Valid withdrawal amount is required' });
    return;
  }

  if (!destinationAddress) {
    res.status(400).json({ success: false, message: 'Destination wallet address is required' });
    return;
  }

  if (user.is2FAEnabled && !twoFactorCode) {
    res.status(400).json({ success: false, message: '2FA authentication code is required' });
    return;
  }

  const fee = 15.0;
  if (user.balance < wdrAmount) {
    res.status(400).json({ success: false, message: 'Insufficient wallet balance for withdrawal' });
    return;
  }

  // Deduct balance
  user.balance -= wdrAmount;

  const txId = `tx_wdr_${Math.floor(10000 + Math.random() * 90000)}`;
  const createdAt = new Date().toISOString();
  const netPayout = Number((wdrAmount - fee).toFixed(2));

  const withdrawal: WithdrawalTransaction = {
    id: txId,
    userId: user.id,
    type: 'withdrawal',
    amount: wdrAmount,
    fee,
    netPayout,
    method: method || 'btc',
    destinationAddress,
    status: 'pending',
    createdAt,
  };

  db.withdrawalTransactions.set(txId, withdrawal);

  // Add to ledger
  const ledgerItem: TransactionLedgerItem = {
    id: txId,
    userId: user.id,
    type: 'withdrawal',
    amount: wdrAmount,
    status: 'pending',
    plan: 'External Payout',
    date: createdAt,
  };
  db.transactions.unshift(ledgerItem);

  res.status(201).json({
    success: true,
    withdrawal: {
      id: withdrawal.id,
      amount: withdrawal.amount,
      fee: withdrawal.fee,
      netPayout: withdrawal.netPayout,
      destinationAddress: withdrawal.destinationAddress,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
    },
  });
});

export default router;
