import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { TransactionModel } from '../models';

const router = Router();

// GET /api/v1/transactions?type=all&status=all&page=1&limit=20
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const typeFilter = (req.query.type as string) || 'all';
    const statusFilter = (req.query.status as string) || 'all';
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));

    const filter: Record<string, any> = { userId: user.userId };

    if (typeFilter !== 'all') {
      filter.type = new RegExp(`^${typeFilter}$`, 'i');
    }

    if (statusFilter !== 'all') {
      filter.status = new RegExp(`^${statusFilter}$`, 'i');
    }

    const total = await TransactionModel.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;

    const transactions = await TransactionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    const paginatedData = transactions.map((tx) => ({
      id: tx.transactionId,
      type: tx.type,
      amount: tx.amount,
      status: tx.status,
      plan: tx.plan,
      receiptImage: tx.receiptImage || '',
      date: tx.date || tx.createdAt.toISOString(),
    }));

    res.status(200).json({
      data: paginatedData,
      pagination: {
        total,
        page,
        totalPages,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching transactions' });
  }
});

export default router;
