import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { DepositModel, TransactionModel } from '../models';
import { PLATFORM_DEPOSIT_METHODS } from '../config/platform';

const router = Router();

// GET /api/v1/deposits/methods
router.get('/methods', (_req, res: Response): void => {
  res.status(200).json({
    methods: PLATFORM_DEPOSIT_METHODS,
  });
});

// GET /api/v1/deposits (Get user's deposits)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const userDeposits = await DepositModel.find({ userId: user.userId }).sort({ createdAt: -1 });

    const formatted = userDeposits.map((dep) => ({
      id: dep.depositId,
      userId: dep.userId,
      userName: dep.userName,
      userEmail: dep.userEmail,
      type: dep.type,
      amount: dep.amount,
      method: dep.method,
      currency: dep.currency,
      transactionHash: dep.transactionHash,
      receiptImage: dep.receiptImage,
      status: dep.status,
      createdAt: dep.createdAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      deposits: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching deposits' });
  }
});

// GET /api/v1/deposits/:id
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const id = req.params.id as string;
    const dep = await DepositModel.findOne({ depositId: id, userId: user.userId });

    if (!dep) {
      res.status(404).json({ success: false, message: 'Deposit transaction not found' });
      return;
    }

    res.status(200).json({
      success: true,
      deposit: {
        id: dep.depositId,
        userId: dep.userId,
        userName: dep.userName,
        userEmail: dep.userEmail,
        type: dep.type,
        amount: dep.amount,
        method: dep.method,
        currency: dep.currency,
        transactionHash: dep.transactionHash,
        receiptImage: dep.receiptImage,
        status: dep.status,
        createdAt: dep.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching deposit' });
  }
});

// POST /api/v1/deposits
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { method, amount, currency, transactionHash, receiptImage, proofImage } = req.body;

    const numericAmount = Number(amount);
    if (!numericAmount || isNaN(numericAmount) || numericAmount <= 0) {
      res.status(400).json({ success: false, message: 'Valid deposit amount is required' });
      return;
    }

    const selectedMethod = PLATFORM_DEPOSIT_METHODS.find(
      (m) => m.id.toLowerCase() === (method || 'btc').toLowerCase()
    );
    const methodName = selectedMethod ? selectedMethod.name : `${(method || 'BTC').toUpperCase()}`;

    const txId = `tx_dep_${Math.floor(10000 + Math.random() * 90000)}`;
    const finalReceiptImage = receiptImage || proofImage || '';

    // Persist to MongoDB DepositModel
    const depositDoc = await DepositModel.create({
      depositId: txId,
      userId: user.userId,
      userName: user.name,
      userEmail: user.email,
      type: 'deposit',
      amount: numericAmount,
      method: methodName,
      currency: currency || 'USD',
      transactionHash: transactionHash || `0x${Math.random().toString(16).substring(2, 30)}`,
      receiptImage: finalReceiptImage,
      status: 'pending',
    });

    // Persist to MongoDB TransactionModel
    await TransactionModel.create({
      transactionId: txId,
      userId: user.userId,
      type: 'deposit',
      amount: numericAmount,
      status: 'pending',
      plan: 'Direct Inflow',
      receiptImage: finalReceiptImage,
      date: depositDoc.createdAt.toISOString(),
    });

    res.status(201).json({
      success: true,
      transaction: {
        id: depositDoc.depositId,
        type: depositDoc.type,
        amount: depositDoc.amount,
        method: depositDoc.method,
        transactionHash: depositDoc.transactionHash,
        receiptImage: depositDoc.receiptImage,
        status: depositDoc.status,
        createdAt: depositDoc.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error creating deposit' });
  }
});

export default router;
