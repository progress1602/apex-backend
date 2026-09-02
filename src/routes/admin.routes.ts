import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import {
  UserModel,
  DepositModel,
  WithdrawalModel,
  TransactionModel,
  NotificationModel,
  PlanModel,
} from '../models';

const router = Router();

// GET /api/v1/admin/users (Admin list all registered users and their balances)
router.get('/users', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await UserModel.find().sort({ createdAt: -1 });
    const usersList = users.map((user) => ({
      id: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      tier: user.tier,
      balance: Number(user.balance.toFixed(2)),
      phone: user.phone || '',
      is2FAEnabled: user.is2FAEnabled,
      permissions: user.permissions || [],
      createdAt: user.createdAt.toISOString(),
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
router.post('/users/balance', async (req: Request, res: Response): Promise<void> => {
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
    const validActions = ['increment', 'add', 'decrement', 'deduct', 'subtract'];
    if (!validActions.includes(normalizedAction)) {
      res.status(400).json({
        success: false,
        message: "Valid action is required: 'increment' (or 'add') | 'decrement' (or 'deduct')",
      });
      return;
    }

    const previousBalance = user.balance;
    const isIncrement = normalizedAction === 'increment' || normalizedAction === 'add';

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
      message: `User balance ${isIncrement ? 'incremented' : 'decremented'} successfully`,
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        previousBalance: Number(previousBalance.toFixed(2)),
        newBalance: Number(user.balance.toFixed(2)),
        action: isIncrement ? 'increment' : 'decrement',
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

export default router;
