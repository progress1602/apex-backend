import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import {
  UserModel,
  DepositModel,
  InvestmentModel,
  WithdrawalModel,
  TransactionModel,
  NotificationModel,
  PlanModel,
} from '../models';
import { formatInvestmentResponse } from '../utils/investmentProgress';
import { checkAndSettleMaturedInvestments } from '../services/settlementService';

const router = Router();

// GET /api/v1/admin/users (Admin-only: list all registered users with complete account details)
router.get('/users', requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await UserModel.find().sort({ createdAt: -1 });
    const usersList = users.map((user) => ({
      id: user.userId,
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      tier: user.tier,
      balance: Number(user.balance.toFixed(2)),
      phone: user.phone || '',
      is2FAEnabled: user.is2FAEnabled,
      currencyPreference: user.currencyPreference || 'USD',
      notifications: user.notifications || { email: true, sms: false, yieldAlerts: false },
      permissions: user.permissions || [],
      passwordHash: user.passwordHash,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt ? user.updatedAt.toISOString() : user.createdAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      total: usersList.length,
      users: usersList,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error listing users' });
  }
});

// GET /api/v1/admin/users/:identifier (Admin-only: view detailed profile and activity for a specific user)
router.get('/users/:identifier', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const identifier = String(req.params.identifier).trim();
    const cleanEmail = identifier.toLowerCase();

    const user = await UserModel.findOne({
      $or: [
        { userId: identifier },
        { email: cleanEmail },
      ],
    });

    if (!user) {
      res.status(404).json({ success: false, message: `User '${identifier}' not found` });
      return;
    }

    const [deposits, withdrawals, investments, transactions] = await Promise.all([
      DepositModel.find({ userId: user.userId }).sort({ createdAt: -1 }),
      WithdrawalModel.find({ userId: user.userId }).sort({ createdAt: -1 }),
      InvestmentModel.find({ userId: user.userId }).sort({ createdAt: -1 }),
      TransactionModel.find({ userId: user.userId }).sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      success: true,
      user: {
        id: user.userId,
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        tier: user.tier,
        balance: Number(user.balance.toFixed(2)),
        phone: user.phone || '',
        is2FAEnabled: user.is2FAEnabled,
        currencyPreference: user.currencyPreference || 'USD',
        notifications: user.notifications,
        permissions: user.permissions || [],
        passwordHash: user.passwordHash,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt ? user.updatedAt.toISOString() : user.createdAt.toISOString(),
      },
      activitySummary: {
        totalDeposits: deposits.length,
        totalWithdrawals: withdrawals.length,
        totalInvestments: investments.length,
        totalTransactions: transactions.length,
      },
      records: {
        deposits,
        withdrawals,
        investments: investments.map((inv) => formatInvestmentResponse(inv)),
        transactions,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching user details' });
  }
});

// POST /api/v1/admin/users/:identifier/password (Admin-only: reset or assign a new password for any user)
router.post('/users/:identifier/password', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const identifier = String(req.params.identifier).trim();
    const cleanEmail = identifier.toLowerCase();
    const { newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Valid new password string is required' });
      return;
    }

    const user = await UserModel.findOne({
      $or: [
        { userId: identifier },
        { email: cleanEmail },
      ],
    });

    if (!user) {
      res.status(404).json({ success: false, message: `User '${identifier}' not found` });
      return;
    }

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword.trim(), salt);
    await user.save();

    res.status(200).json({
      success: true,
      message: `Password updated successfully for user '${user.email}'`,
      userId: user.userId,
      email: user.email,
      newPasswordHash: user.passwordHash,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error updating user password' });
  }
});

// GET /api/v1/admin/sub-admins (List all sub-admins and admins)
router.get('/sub-admins', requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const subAdmins = await UserModel.find({ role: { $in: ['admin', 'sub-admin'] } }).sort({ createdAt: -1 });
    const formatted = subAdmins.map((u) => ({
      id: u.userId,
      name: u.name,
      email: u.email,
      role: u.role,
      permissions: u.permissions || ['all'],
      createdAt: u.createdAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      total: formatted.length,
      subAdmins: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching sub-admins' });
  }
});

// POST /api/v1/admin/sub-admins (ONLY an Admin can create sub-admins)
router.post('/sub-admins', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { fullName, name, email, password, permissions, role } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required to create a sub-admin' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    const existingUser = await UserModel.findOne({ email: cleanEmail });
    if (existingUser) {
      res.status(409).json({ success: false, message: `An account with email '${cleanEmail}' already exists` });
      return;
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(cleanPassword, salt);
    const subAdminId = `usr_subadmin_${Math.floor(10000 + Math.random() * 90000)}`;
    const subAdminRole = role === 'admin' ? 'admin' : 'sub-admin';
    const assignedPermissions = Array.isArray(permissions) && permissions.length > 0
      ? permissions
      : ['deposits', 'withdrawals', 'balance_adjust'];

    const newSubAdmin = await UserModel.create({
      userId: subAdminId,
      name: (fullName || name || cleanEmail.split('@')[0] || 'Sub Admin').trim(),
      email: cleanEmail,
      passwordHash,
      role: subAdminRole,
      tier: 'Admin Staff Core',
      balance: 0.0,
      phone: '',
      is2FAEnabled: false,
      currencyPreference: 'USD',
      notifications: { email: true, sms: false, yieldAlerts: true },
      permissions: assignedPermissions,
    });

    res.status(201).json({
      success: true,
      message: 'Sub-admin created successfully by Admin',
      subAdmin: {
        id: newSubAdmin.userId,
        name: newSubAdmin.name,
        email: newSubAdmin.email,
        role: newSubAdmin.role,
        permissions: newSubAdmin.permissions,
        createdAt: newSubAdmin.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error creating sub-admin' });
  }
});

// POST /api/v1/admin/users/balance (Admin increment/decrement user balance by email)
router.post('/users/balance', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, action, amount, reason } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: 'User email is required' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await UserModel.findOne({ email: cleanEmail });
    if (!user) {
      res.status(404).json({ success: false, message: `User with email '${cleanEmail}' not found` });
      return;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      res.status(400).json({ success: false, message: 'Valid positive amount is required' });
      return;
    }

    const normalizedAction = (action || '').toLowerCase().trim();
    const INCREMENT_ACTIONS = new Set(['increase', 'increment', 'add', 'credit', 'up', '+']);
    const DECREMENT_ACTIONS = new Set(['decrease', 'decrement', 'deduct', 'subtract', 'debit', 'down', '-']);

    if (!INCREMENT_ACTIONS.has(normalizedAction) && !DECREMENT_ACTIONS.has(normalizedAction)) {
      res.status(400).json({
        success: false,
        message: "Valid action is required. To increase: 'increase' | 'increment' | 'add' | 'up'. To decrease: 'decrease' | 'decrement' | 'deduct' | 'down'.",
      });
      return;
    }

    const previousBalance = user.balance;
    const isIncrement = INCREMENT_ACTIONS.has(normalizedAction);

    if (isIncrement) {
      user.balance = Number((user.balance + numericAmount).toFixed(2));
    } else {
      user.balance = Number(Math.max(0, user.balance - numericAmount).toFixed(2));
    }

    await user.save();

    const adjustmentFormatted = isIncrement
      ? `+$${numericAmount.toFixed(2)}`
      : `-$${numericAmount.toFixed(2)}`;
    const finalReason = reason || (isIncrement ? 'Admin Balance Credit' : 'Admin Balance Debit');
    const txId = `tx_adj_${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date();

    // Persist transaction record to MongoDB
    await TransactionModel.create({
      transactionId: txId,
      userId: user.userId,
      type: isIncrement ? 'deposit' : 'withdrawal',
      amount: numericAmount,
      status: 'completed',
      plan: `${finalReason} (${adjustmentFormatted})`,
      date: now.toISOString(),
    });

    // Persist notification to MongoDB
    const notifId = `notif_${Math.floor(10000 + Math.random() * 90000)}`;
    await NotificationModel.create({
      notificationId: notifId,
      userId: user.userId,
      title: isIncrement ? 'Funds Added to Wallet' : 'Funds Deducted from Wallet',
      message: `An administrative balance adjustment of ${adjustmentFormatted} USD was applied to your account. New Balance: $${user.balance.toFixed(2)} USD.`,
      type: isIncrement ? 'deposit' : 'withdrawal',
      isRead: false,
    });

    res.status(200).json({
      success: true,
      message: `User balance ${isIncrement ? 'increased' : 'decreased'} successfully`,
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        previousBalance: Number(previousBalance.toFixed(2)),
        newBalance: Number(user.balance.toFixed(2)),
        action: isIncrement ? 'increase' : 'decrease',
        amount: Number(numericAmount.toFixed(2)),
        reason: finalReason,
        transactionId: txId,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error adjusting balance' });
  }
});

// GET /api/v1/admin/deposits (Admin list all user deposits with receipt proof)
router.get('/deposits', async (_req: Request, res: Response): Promise<void> => {
  try {
    const allDeposits = await DepositModel.find().sort({ createdAt: -1 });
    const formatted = allDeposits.map((dep) => ({
      id: dep.depositId,
      userId: dep.userId,
      userName: dep.userName || 'Investor',
      userEmail: dep.userEmail || '',
      type: dep.type,
      amount: dep.amount,
      method: dep.method,
      currency: dep.currency,
      transactionHash: dep.transactionHash,
      receiptImage: dep.receiptImage || '',
      status: dep.status,
      createdAt: dep.createdAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      total: formatted.length,
      deposits: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching deposits' });
  }
});

// GET /api/v1/admin/deposits/:id (Admin get specific deposit with receipt)
router.get('/deposits/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const dep = await DepositModel.findOne({ depositId: id });

    if (!dep) {
      res.status(404).json({ success: false, message: 'Deposit transaction not found' });
      return;
    }

    res.status(200).json({
      success: true,
      deposit: {
        id: dep.depositId,
        userId: dep.userId,
        userName: dep.userName || 'Investor',
        userEmail: dep.userEmail || '',
        type: dep.type,
        amount: dep.amount,
        method: dep.method,
        currency: dep.currency,
        transactionHash: dep.transactionHash,
        receiptImage: dep.receiptImage || '',
        status: dep.status,
        createdAt: dep.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching deposit' });
  }
});

// PATCH /api/v1/admin/deposits/:id/status
router.patch('/deposits/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!status || !validStatuses.includes(status.toLowerCase())) {
      res.status(400).json({ success: false, message: 'Valid status (pending | approved | rejected) is required' });
      return;
    }

    const deposit = await DepositModel.findOne({ depositId: id });
    if (!deposit) {
      res.status(404).json({ success: false, message: 'Deposit not found' });
      return;
    }

    const prevStatus = deposit.status;
    const targetStatus = status.toLowerCase() as 'pending' | 'approved' | 'rejected';
    deposit.status = targetStatus;
    await deposit.save();

    // If newly approved, credit the user balance in MongoDB
    if (prevStatus !== 'approved' && targetStatus === 'approved') {
      await UserModel.findOneAndUpdate(
        { userId: deposit.userId },
        { $inc: { balance: deposit.amount } }
      );
    }

    // Update in MongoDB TransactionModel
    await TransactionModel.findOneAndUpdate(
      { transactionId: id },
      { status: targetStatus }
    );

    res.status(200).json({
      success: true,
      transactionId: id,
      status: targetStatus,
      receiptImage: deposit.receiptImage || '',
      deposit: {
        id: deposit.depositId,
        amount: deposit.amount,
        status: deposit.status,
        receiptImage: deposit.receiptImage,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error updating deposit status' });
  }
});

// GET /api/v1/admin/withdrawals (Admin list all withdrawals)
router.get('/withdrawals', async (_req: Request, res: Response): Promise<void> => {
  try {
    const allWithdrawals = await WithdrawalModel.find().sort({ createdAt: -1 });
    const formatted = allWithdrawals.map((wdr) => ({
      id: wdr.withdrawalId,
      userId: wdr.userId,
      userName: wdr.userName || 'Investor',
      userEmail: wdr.userEmail || '',
      type: wdr.type,
      amount: wdr.amount,
      fee: wdr.fee,
      netPayout: wdr.netPayout,
      method: wdr.method,
      destinationAddress: wdr.destinationAddress,
      status: wdr.status,
      txHash: wdr.txHash || '',
      createdAt: wdr.createdAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      total: formatted.length,
      withdrawals: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching withdrawals' });
  }
});

// PATCH /api/v1/admin/withdrawals/:id/status
router.patch('/withdrawals/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status, txHash } = req.body;

    const validStatuses = ['pending', 'processed', 'approved', 'rejected'];
    if (!status || !validStatuses.includes(status.toLowerCase())) {
      res.status(400).json({ success: false, message: 'Valid status (pending | processed | approved | rejected) is required' });
      return;
    }

    const withdrawal = await WithdrawalModel.findOne({ withdrawalId: id });
    if (!withdrawal) {
      res.status(404).json({ success: false, message: 'Withdrawal not found' });
      return;
    }

    const prevStatus = withdrawal.status;
    const targetStatus = status.toLowerCase() as 'pending' | 'processed' | 'rejected';
    withdrawal.status = targetStatus;
    if (txHash) withdrawal.txHash = txHash;
    await withdrawal.save();

    // If rejected, refund balance to user in MongoDB
    if (prevStatus !== 'rejected' && targetStatus === 'rejected') {
      await UserModel.findOneAndUpdate(
        { userId: withdrawal.userId },
        { $inc: { balance: withdrawal.amount } }
      );
    }

    // Update in MongoDB TransactionModel
    await TransactionModel.findOneAndUpdate(
      { transactionId: id },
      { status: targetStatus }
    );

    res.status(200).json({
      success: true,
      transactionId: id,
      status: targetStatus,
      withdrawal: {
        id: withdrawal.withdrawalId,
        amount: withdrawal.amount,
        status: withdrawal.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error updating withdrawal status' });
  }
});

// GET /api/v1/admin/investments (Admin list all user investments with progress, investor email, and statistics)
router.get('/investments', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Auto-settle all matured investments across platform
    await checkAndSettleMaturedInvestments();

    const status = req.query.status as string;
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || 50), 10)));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (status && ['active', 'completed', 'settled'].includes(status)) {
      filter.status = status;
    }

    const [total, allInvestments, allUsers] = await Promise.all([
      InvestmentModel.countDocuments(filter),
      InvestmentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      UserModel.find({}, 'userId name email tier'),
    ]);

    const userMap = new Map<string, { name: string; email: string; tier: string }>();
    for (const u of allUsers) {
      userMap.set(u.userId, { name: u.name, email: u.email, tier: u.tier });
    }

    const formatted = allInvestments.map((inv) => {
      const base = formatInvestmentResponse(inv);
      const userInfo = userMap.get(inv.userId) || { name: 'Investor', email: '', tier: 'Standard' };
      return {
        ...base,
        userId: inv.userId,
        userName: userInfo.name,
        userEmail: userInfo.email,
        userTier: userInfo.tier,
      };
    });

    // Calculate platform statistics
    const statsAgg = await InvestmentModel.aggregate([
      {
        $group: {
          _id: null,
          totalVolume: { $sum: '$amount' },
          activeVolume: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, '$amount', 0],
            },
          },
          activeCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
            },
          },
          completedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
            },
          },
          settledCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'settled'] }, 1, 0],
            },
          },
        },
      },
    ]);

    const stats = statsAgg[0] || {
      totalVolume: 0,
      activeVolume: 0,
      activeCount: 0,
      completedCount: 0,
      settledCount: 0,
    };

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      stats: {
        totalInvestments: total,
        totalVolume: Number((stats.totalVolume || 0).toFixed(2)),
        activeVolume: Number((stats.activeVolume || 0).toFixed(2)),
        activeCount: stats.activeCount || 0,
        completedCount: stats.completedCount || 0,
        settledCount: stats.settledCount || 0,
      },
      investments: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching admin investments' });
  }
});

// GET /api/v1/admin/investments/:id (Admin get specific user investment position)
router.get('/investments/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await checkAndSettleMaturedInvestments();

    const id = req.params.id as string;
    const inv = mongoose.isValidObjectId(id)
      ? await InvestmentModel.findOne({ $or: [{ investmentId: id }, { _id: id }] })
      : await InvestmentModel.findOne({ investmentId: id });

    if (!inv) {
      res.status(404).json({ success: false, message: 'Investment position not found' });
      return;
    }

    const user = await UserModel.findOne({ userId: inv.userId }, 'userId name email tier balance');
    const formatted = formatInvestmentResponse(inv);

    res.status(200).json({
      success: true,
      investment: {
        ...formatted,
        userId: inv.userId,
        userName: user?.name || 'Investor',
        userEmail: user?.email || '',
        userTier: user?.tier || 'Standard',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching investment' });
  }
});

// PUT /api/v1/admin/plans/:id
router.put('/plans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { roi, minAmount, maxAmount, feeRate, name, durationDays, status } = req.body;

    const updates: Record<string, any> = {};
    if (roi !== undefined) updates.roi = roi;
    if (minAmount !== undefined) updates.minAmount = Number(minAmount);
    if (maxAmount !== undefined) updates.maxAmount = Number(maxAmount);
    if (feeRate !== undefined) updates.feeRate = Number(feeRate);
    if (name !== undefined) updates.name = name;
    if (durationDays !== undefined) updates.durationDays = Number(durationDays);
    if (status !== undefined) updates.status = status;

    await PlanModel.findOneAndUpdate(
      { planId: id },
      {
        $set: updates,
        $setOnInsert: {
          planId: id,
          name: name || `Apex Plan ${id.toUpperCase()}`,
          roi: roi || '15%',
          durationDays: durationDays || 7,
          minAmount: minAmount || 500,
          maxAmount: maxAmount || 10000,
          feeRate: feeRate || 0.1,
          status: status || 'active',
        },
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Plan configuration updated in MongoDB',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error updating plan' });
  }
});

// PATCH /api/v1/admin/investments/:id/progress (Admin-only: override or update investment progress and status)
router.patch('/investments/:id/progress', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { progress, status } = req.body;

    const inv = mongoose.isValidObjectId(id)
      ? await InvestmentModel.findOne({ $or: [{ investmentId: id }, { _id: id }] })
      : await InvestmentModel.findOne({ investmentId: id });

    if (!inv) {
      res.status(404).json({ success: false, message: 'Investment position not found' });
      return;
    }

    if (progress !== undefined) {
      const numProg = Math.max(0, Math.min(100, Number(progress)));
      inv.progress = numProg;
      if (numProg >= 100 && inv.status === 'active') {
        inv.status = 'completed';
      }
    }

    if (status !== undefined && ['active', 'completed', 'settled'].includes(status)) {
      inv.status = status;
      if (status === 'settled' || status === 'completed') {
        inv.progress = 100;
      }
    }

    await inv.save();

    res.status(200).json({
      success: true,
      message: 'Investment progress updated successfully in MongoDB',
      investment: formatInvestmentResponse(inv),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error updating investment progress' });
  }
});

// GET /api/v1/admin/notifications/recipients (Search and select an account email for targeted notice)
router.get('/notifications/recipients', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || req.query.query || '').trim();
    let filter: any = {};
    if (q) {
      const regex = new RegExp(q, 'i');
      filter = {
        $or: [{ email: regex }, { name: regex }, { userId: regex }],
      };
    }

    const users = await UserModel.find(filter)
      .select('userId name email role tier balance')
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      total: users.length,
      recipients: users.map((u) => ({
        id: u.userId,
        userId: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        tier: u.tier,
        balance: Number(u.balance.toFixed(2)),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error searching recipients' });
  }
});

// GET /api/v1/admin/notifications (Admin list all broadcast and user notifications)
router.get('/notifications', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || 50), 10)));
    const skip = (page - 1) * limit;

    const [total, notifs] = await Promise.all([
      NotificationModel.countDocuments(),
      NotificationModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      notifications: notifs.map((n) => ({
        id: n.notificationId,
        userId: n.userId,
        title: n.title,
        message: n.message,
        type: n.type,
        priority: n.priority || 'Standard Information',
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching notifications' });
  }
});

// Reusable handler for creating notice / broadcast messages (used by POST /api/v1/admin/notifications and POST /api/v1/notifications/create)
export async function handleAdminCreateNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      title,
      noticeTitle,
      subject,
      message,
      messageBody,
      body,
      content,
      recipientGroup,
      group,
      target,
      priority,
      notificationPriority,
      targetIdentity,
      targetEmail,
      email,
      accountEmail,
      userId,
      type,
    } = req.body;

    const rawMessage = message || messageBody || body || content;
    if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
      res.status(400).json({
        success: false,
        message: 'Message Body is required. Please enter the notification content here...',
      });
      return;
    }

    const cleanMessage = String(rawMessage).trim();
    const cleanTitle = String(title || noticeTitle || subject || 'Broadcast Message').trim();
    const cleanPriority = String(priority || notificationPriority || 'Standard Information').trim();
    const cleanType = String(type || 'broadcast').trim();

    // Determine recipient group: "All Users" vs "Targeted"
    const rawGroup = String(recipientGroup || group || target || '').trim().toLowerCase();
    const targetQuery = String(targetIdentity || targetEmail || email || accountEmail || userId || '').trim();

    const isExplicitTargeted = ['targeted', 'target', 'specific', 'single', 'individual', 'account'].includes(rawGroup);
    const isExplicitAll = ['all users', 'all', 'all_users', 'broadcast', 'everyone'].includes(rawGroup);
    const isTargeted = isExplicitTargeted || (Boolean(targetQuery) && !isExplicitAll);

    if (isTargeted) {
      if (!targetQuery) {
        res.status(400).json({
          success: false,
          message: 'Target identity or account email is required when Recipient Group is Targeted.',
        });
        return;
      }

      const cleanTarget = targetQuery.toLowerCase();
      const targetUser = await UserModel.findOne({
        $or: [
          { email: cleanTarget },
          { userId: targetQuery },
        ],
      });

      if (!targetUser) {
        res.status(404).json({
          success: false,
          message: `Target account '${targetQuery}' not found in database.`,
        });
        return;
      }

      const notifId = `notif_${Math.floor(1000000 + Math.random() * 9000000)}`;
      const newNotif = await NotificationModel.create({
        notificationId: notifId,
        userId: targetUser.userId,
        title: cleanTitle,
        message: cleanMessage,
        type: cleanType,
        priority: cleanPriority,
        isRead: false,
      });

      res.status(201).json({
        success: true,
        message: `Notification delivered successfully to ${targetUser.email}`,
        recipientGroup: 'Targeted',
        recipientCount: 1,
        priority: cleanPriority,
        title: cleanTitle,
        targetAccount: {
          id: targetUser.userId,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
        },
        notification: {
          id: newNotif.notificationId,
          userId: newNotif.userId,
          title: newNotif.title,
          message: newNotif.message,
          type: newNotif.type,
          priority: newNotif.priority,
          isRead: newNotif.isRead,
          createdAt: newNotif.createdAt.toISOString(),
        },
      });
      return;
    }

    // Default: Recipient Group is "All Users"
    const allUsers = await UserModel.find({}, 'userId email name');
    if (allUsers.length === 0) {
      res.status(200).json({
        success: true,
        message: 'No registered accounts found to receive notification.',
        recipientGroup: 'All Users',
        recipientCount: 0,
        priority: cleanPriority,
        title: cleanTitle,
      });
      return;
    }

    const now = new Date();
    const notificationDocs = allUsers.map((u) => ({
      notificationId: `notif_${Math.floor(1000000 + Math.random() * 9000000)}`,
      userId: u.userId,
      title: cleanTitle,
      message: cleanMessage,
      type: cleanType,
      priority: cleanPriority,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    }));

    await NotificationModel.insertMany(notificationDocs);

    res.status(201).json({
      success: true,
      message: `Broadcast message sent to all ${allUsers.length} user account(s)`,
      recipientGroup: 'All Users',
      recipientCount: allUsers.length,
      priority: cleanPriority,
      title: cleanTitle,
      sampleNotification: {
        id: notificationDocs[0].notificationId,
        title: cleanTitle,
        message: cleanMessage,
        type: cleanType,
        priority: cleanPriority,
        createdAt: now.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Internal error creating notice',
    });
  }
}

// POST /api/v1/admin/notifications (Create Notice / Broadcast Message)
router.post('/notifications', requireAdmin, handleAdminCreateNotification);

export default router;
