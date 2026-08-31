import { Router, Response } from 'express';
import { db } from '../store/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { DepositTransaction, TransactionLedgerItem } from '../types';

const router = Router();

// GET /api/v1/deposits/methods
router.get('/methods', (_req, res: Response): void => {
  res.status(200).json({
    methods: db.depositMethods,
  });
});

// GET /api/v1/deposits (Get user's deposits)
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const userDeposits = Array.from(db.depositTransactions.values()).filter(
    (tx) => tx.userId === user.id
  );

  res.status(200).json({
    success: true,
    deposits: userDeposits,
  });
});

// GET /api/v1/deposits/:id
router.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const id = req.params.id as string;
  const deposit = db.depositTransactions.get(id);

  if (!deposit || deposit.userId !== user.id) {
    res.status(404).json({ success: false, message: 'Deposit transaction not found' });
    return;
  }

  res.status(200).json({
    success: true,
    deposit,
  });
});

// POST /api/v1/deposits
router.post('/', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { method, amount, currency, transactionHash, receiptImage, proofImage } = req.body;

  if (!amount || amount <= 0) {
    res.status(400).json({ success: false, message: 'Valid deposit amount is required' });
    return;
  }

  const selectedMethod = db.depositMethods.find(
    (m) => m.id.toLowerCase() === (method || 'btc').toLowerCase()
  );
  const methodName = selectedMethod ? selectedMethod.name : `${(method || 'BTC').toUpperCase()}`;

  const txId = `tx_dep_${Math.floor(10000 + Math.random() * 90000)}`;
  const createdAt = new Date().toISOString();
  const finalReceiptImage = receiptImage || proofImage || '';

  const depositTx: DepositTransaction = {
    id: txId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    type: 'deposit',
    amount: Number(amount),
    method: methodName,
    currency: currency || 'USD',
    transactionHash: transactionHash || `0x${Math.random().toString(16).substring(2, 30)}`,
    receiptImage: finalReceiptImage,
    status: 'pending',
    createdAt,
  };

  db.depositTransactions.set(txId, depositTx);

  // Add to ledger
  const ledgerItem: TransactionLedgerItem = {
    id: txId,
    userId: user.id,
    type: 'deposit',
    amount: Number(amount),
    status: 'pending',
    plan: 'Direct Inflow',
    receiptImage: finalReceiptImage,
    date: createdAt,
  };
  db.transactions.unshift(ledgerItem);

  res.status(201).json({
    success: true,
    transaction: {
      id: depositTx.id,
      type: depositTx.type,
      amount: depositTx.amount,
      method: depositTx.method,
      transactionHash: depositTx.transactionHash,
      receiptImage: depositTx.receiptImage,
      status: depositTx.status,
      createdAt: depositTx.createdAt,
    },
  });
});

export default router;
