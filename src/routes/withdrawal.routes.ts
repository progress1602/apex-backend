import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { UserModel, WithdrawalModel, TransactionModel } from '../models';

const router = Router();

// POST /api/v1/withdrawals
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { amount, method, destinationAddress, twoFactorCode } = req.body;

    const wdrAmount = Number(amount);
    if (!wdrAmount || isNaN(wdrAmount) || wdrAmount <= 0) {
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

    // Atomically check and deduct balance from MongoDB
    const updatedUser = await UserModel.findOneAndUpdate(
      { userId: user.userId, balance: { $gte: wdrAmount } },
      { $inc: { balance: -wdrAmount } },
      { new: true }
    );

    if (!updatedUser) {
      res.status(400).json({ success: false, message: 'Insufficient wallet balance for withdrawal' });
      return;
    }

    const txId = `tx_wdr_${Math.floor(10000 + Math.random() * 90000)}`;
    const netPayout = Number((wdrAmount - fee).toFixed(2));

    // Persist to MongoDB WithdrawalModel
    const withdrawal = await WithdrawalModel.create({
      withdrawalId: txId,
      userId: user.userId,
      userName: user.name,
      userEmail: user.email,
      type: 'withdrawal',
      amount: wdrAmount,
      fee,
      netPayout,
      method: method || 'btc',
      destinationAddress,
      status: 'pending',
    });

    // Persist to MongoDB TransactionModel
    await TransactionModel.create({
      transactionId: txId,
      userId: user.userId,
      type: 'withdrawal',
      amount: wdrAmount,
      status: 'pending',
      plan: 'External Payout',
      date: withdrawal.createdAt.toISOString(),
    });

    res.status(201).json({
      success: true,
      withdrawal: {
        id: withdrawal.withdrawalId,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        netPayout: withdrawal.netPayout,
        destinationAddress: withdrawal.destinationAddress,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error processing withdrawal' });
  }
});

export default router;
