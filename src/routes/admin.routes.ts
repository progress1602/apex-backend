import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../store/db';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { TransactionLedgerItem, NotificationItem, User } from '../types';
import { UserModel, DepositModel, WithdrawalModel, TransactionModel, NotificationModel } from '../models';

const router = Router();

// GET /api/v1/admin/users (Admin list all registered users and their balances)
router.get('/users', (_req: Request, res: Response): void => {
  const usersList = Array.from(db.users.values()).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tier: user.tier,
    balance: Number(user.balance.toFixed(2)),
    phone: user.phone || '',
    is2FAEnabled: user.is2FAEnabled,
    permissions: user.permissions || [],
    createdAt: user.createdAt,
  }));

  res.status(200).json({
    success: true,
    total: usersList.length,
    users: usersList,
  });
});

// GET /api/v1/admin/sub-admins (List all sub-admins and admins)
router.get('/sub-admins', requireAdmin, (_req: AuthenticatedRequest, res: Response): void => {
  const subAdmins = Array.from(db.users.values())
    .filter((u) => u.role === 'admin' || u.role === 'sub-admin')
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      permissions: u.permissions || ['all'],
      createdAt: u.createdAt,
    }));

  res.status(200).json({
    success: true,
    total: subAdmins.length,
    subAdmins,
  });
});

// POST /api/v1/admin/sub-admins (ONLY an Admin can create sub-admins)
router.post('/sub-admins', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fullName, name, email, password, permissions, role } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required to create a sub-admin' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password).trim();

  const existingUser = db.getUserByEmail(cleanEmail);
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

  const newSubAdmin: User = {
    id: subAdminId,
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
    createdAt: new Date().toISOString(),
  };

  // Save to in-memory store & disk
  db.users.set(newSubAdmin.id, newSubAdmin);
  db.saveToDisk();

  // Save to MongoDB Mongoose Model
  try {
    await UserModel.create({
      userId: newSubAdmin.id,
      name: newSubAdmin.name,
      email: newSubAdmin.email,
      passwordHash: newSubAdmin.passwordHash,
      role: newSubAdmin.role,
      tier: newSubAdmin.tier,
      balance: newSubAdmin.balance,
      permissions: newSubAdmin.permissions,
    });
  } catch (err) {
    console.error('Mongoose sub-admin creation sync error:', err);
  }

  res.status(201).json({
    success: true,
    message: 'Sub-admin created successfully by Admin',
    subAdmin: {
      id: newSubAdmin.id,
      name: newSubAdmin.name,
      email: newSubAdmin.email,
      role: newSubAdmin.role,
      permissions: newSubAdmin.permissions,
      createdAt: newSubAdmin.createdAt,
    },
  });
});

// POST /api/v1/admin/users/balance (Admin increment/decrement user balance by email)
router.post('/users/balance', async (req: Request, res: Response): Promise<void> => {
  const { email, action, amount, reason } = req.body;

  if (!email) {
    res.status(400).json({ success: false, message: 'User email is required' });
    return;
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    res.status(404).json({ success: false, message: `User with email '${email}' not found` });
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

  const adjustmentFormatted = isIncrement
    ? `+$${numericAmount.toFixed(2)}`
    : `-$${numericAmount.toFixed(2)}`;
  const finalReason = reason || (isIncrement ? 'Admin Balance Credit' : 'Admin Balance Debit');
  const txId = `tx_adj_${Math.floor(10000 + Math.random() * 90000)}`;
  const createdAt = new Date().toISOString();

  // Record ledger entry
  const ledgerItem: TransactionLedgerItem = {
    id: txId,
    userId: user.id,
    type: isIncrement ? 'deposit' : 'withdrawal',
    amount: numericAmount,
    status: 'completed',
    plan: `${finalReason} (${adjustmentFormatted})`,
    date: createdAt,
  };
  db.transactions.unshift(ledgerItem);

  // Send user alert notification
  const notifId = `notif_${Math.floor(10000 + Math.random() * 90000)}`;
  const notif: NotificationItem = {
    id: notifId,
    userId: user.id,
    title: isIncrement ? 'Funds Added to Wallet' : 'Funds Deducted from Wallet',
    message: `An administrative balance adjustment of ${adjustmentFormatted} USD was applied to your account. New Balance: $${user.balance.toFixed(2)} USD.`,
    type: isIncrement ? 'deposit' : 'withdrawal',
    isRead: false,
    createdAt,
  };
  db.notifications.set(notifId, notif);
  db.saveToDisk();

  // Sync to MongoDB Mongoose Models
  try {
    await UserModel.findOneAndUpdate({ userId: user.id }, { balance: user.balance });
    await TransactionModel.create({
      transactionId: txId,
      userId: user.id,
      type: ledgerItem.type,
      amount: ledgerItem.amount,
      status: ledgerItem.status,
      plan: ledgerItem.plan,
      date: ledgerItem.date,
    });
    await NotificationModel.create({
      notificationId: notifId,
      userId: user.id,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      isRead: false,
    });
  } catch (err) {
    console.error('Mongoose balance sync error:', err);
  }

  res.status(200).json({
    success: true,
    message: `User balance ${isIncrement ? 'incremented' : 'decremented'} successfully`,
    data: {
      userId: user.id,
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
});

// GET /api/v1/admin/deposits (Admin list all user deposits with receipt proof)
router.get('/deposits', (_req: Request, res: Response): void => {
  const allDeposits = Array.from(db.depositTransactions.values()).map((dep) => {
    const user = db.users.get(dep.userId);
    return {
      id: dep.id,
      userId: dep.userId,
      userName: user ? user.name : dep.userName || 'Investor',
      userEmail: user ? user.email : dep.userEmail || '',
      type: dep.type,
      amount: dep.amount,
      method: dep.method,
      currency: dep.currency,
      transactionHash: dep.transactionHash,
      receiptImage: dep.receiptImage || '',
      status: dep.status,
      createdAt: dep.createdAt,
    };
  });

  res.status(200).json({
    success: true,
    total: allDeposits.length,
    deposits: allDeposits,
  });
});

// GET /api/v1/admin/deposits/:id (Admin get specific deposit with receipt)
router.get('/deposits/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const dep = db.depositTransactions.get(id);

  if (!dep) {
    res.status(404).json({ success: false, message: 'Deposit transaction not found' });
    return;
  }

  const user = db.users.get(dep.userId);
  res.status(200).json({
    success: true,
    deposit: {
      id: dep.id,
      userId: dep.userId,
      userName: user ? user.name : dep.userName || 'Investor',
      userEmail: user ? user.email : dep.userEmail || '',
      type: dep.type,
      amount: dep.amount,
      method: dep.method,
      currency: dep.currency,
      transactionHash: dep.transactionHash,
      receiptImage: dep.receiptImage || '',
      status: dep.status,
      createdAt: dep.createdAt,
    },
  });
});

// PATCH /api/v1/admin/deposits/:id/status
router.patch('/deposits/:id/status', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status } = req.body;

  const validStatuses = ['pending', 'approved', 'rejected'];
  if (!status || !validStatuses.includes(status.toLowerCase())) {
    res.status(400).json({ success: false, message: 'Valid status (pending | approved | rejected) is required' });
    return;
  }

  const deposit = db.depositTransactions.get(id);
  let receiptImage = '';

  if (deposit) {
    const prevStatus = deposit.status;
    deposit.status = status.toLowerCase() as 'pending' | 'approved' | 'rejected';
    receiptImage = deposit.receiptImage || '';

    // If newly approved, credit the user balance
    if (prevStatus !== 'approved' && deposit.status === 'approved') {
      const user = db.users.get(deposit.userId);
      if (user) {
        user.balance = Number((user.balance + deposit.amount).toFixed(2));
        UserModel.findOneAndUpdate({ userId: user.id }, { balance: user.balance }).catch(() => {});
      }
    }

    // Update in ledger
    const ledger = db.transactions.find((tx) => tx.id === id);
    if (ledger) {
      ledger.status = deposit.status;
    }

    DepositModel.findOneAndUpdate({ depositId: id }, { status: deposit.status }).catch(() => {});
  }

  db.saveToDisk();

  res.status(200).json({
    success: true,
    transactionId: id,
    status: status.toLowerCase(),
    receiptImage,
    deposit: deposit || null,
  });
});

// GET /api/v1/admin/withdrawals (Admin list all withdrawals)
router.get('/withdrawals', (_req: Request, res: Response): void => {
  const allWithdrawals = Array.from(db.withdrawalTransactions.values()).map((wdr) => {
    const user = db.users.get(wdr.userId);
    return {
      ...wdr,
      userName: user ? user.name : wdr.userName || 'Investor',
      userEmail: user ? user.email : wdr.userEmail || '',
    };
  });

  res.status(200).json({
    success: true,
    total: allWithdrawals.length,
    withdrawals: allWithdrawals,
  });
});

// PATCH /api/v1/admin/withdrawals/:id/status
router.patch('/withdrawals/:id/status', async (req: Request, res: Response): Promise<void> => {
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
        user.balance = Number((user.balance + withdrawal.amount).toFixed(2));
        UserModel.findOneAndUpdate({ userId: user.id }, { balance: user.balance }).catch(() => {});
      }
    }

    // Update in ledger
    const ledger = db.transactions.find((tx) => tx.id === id);
    if (ledger) {
      ledger.status = withdrawal.status;
    }

    WithdrawalModel.findOneAndUpdate({ withdrawalId: id }, { status: withdrawal.status, txHash: withdrawal.txHash }).catch(() => {});
  }

  db.saveToDisk();

  res.status(200).json({
    success: true,
    transactionId: id,
    status: status.toLowerCase(),
    withdrawal: withdrawal || null,
  });
});

// PUT /api/v1/admin/plans/:id
router.put('/plans/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const { roi, minAmount, maxAmount, feeRate, name, durationDays, status } = req.body;

  let plan = db.investmentPlans.get(id);
  if (!plan) {
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
