import { Router, Response } from 'express';
import { db } from '../store/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/transactions?type=all&status=all&page=1&limit=20
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const typeFilter = (req.query.type as string) || 'all';
  const statusFilter = (req.query.status as string) || 'all';
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  let filtered = db.transactions.filter((tx) => tx.userId === user.id);

  if (typeFilter !== 'all') {
    filtered = filtered.filter((tx) => tx.type.toLowerCase() === typeFilter.toLowerCase());
  }

  if (statusFilter !== 'all') {
    filtered = filtered.filter((tx) => tx.status.toLowerCase() === statusFilter.toLowerCase());
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedData = filtered.slice(startIndex, startIndex + limit).map((tx) => ({
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    status: tx.status,
    plan: tx.plan,
    date: tx.date,
  }));

  res.status(200).json({
    data: paginatedData,
    pagination: {
      total,
      page,
      totalPages,
    },
  });
});

export default router;
