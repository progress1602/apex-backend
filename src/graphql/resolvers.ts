import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth';
import {
  UserModel,
  DepositModel,
  InvestmentModel,
  WithdrawalModel,
  TransactionModel,
  NotificationModel,
  PlanModel,
  IUserDocument,
} from '../models';
import {
  PLATFORM_DEPOSIT_METHODS,
  PLATFORM_MARKET_TICKERS,
  generateChartData,
} from '../config/platform';

export const resolvers = {
  User: {
    id: (parent: any) => parent.userId || parent.id,
    name: (parent: any) => parent.name || parent.fullName || '',
    email: (parent: any) => parent.email || '',
    role: (parent: any) => parent.role || 'investor',
    tier: (parent: any) => parent.tier || 'Tier 1 - Standard',
    avatar: (parent: any) => parent.avatar || '',
    balance: (parent: any) => (typeof parent.balance === 'number' ? parent.balance : 0.0),
    phone: (parent: any) => parent.phone || '',
    is2FAEnabled: (parent: any) => Boolean(parent.is2FAEnabled),
    currencyPreference: (parent: any) => parent.currencyPreference || 'USD',
    notifications: (parent: any) => parent.notifications || { email: true, sms: false, yieldAlerts: false },
    permissions: (parent: any) => parent.permissions || [],
    passwordHash: (parent: any) => parent.passwordHash || '',
    createdAt: (parent: any) => (parent.createdAt ? new Date(parent.createdAt).toISOString() : new Date().toISOString()),
    updatedAt: (parent: any) => (parent.updatedAt ? new Date(parent.updatedAt).toISOString() : parent.createdAt ? new Date(parent.createdAt).toISOString() : new Date().toISOString()),
  },

  Query: {
    me: async (_: any, __: any, context: { user?: IUserDocument }) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const freshUser = await UserModel.findOne({ userId: context.user.userId });
      if (!freshUser) throw new Error('Unauthorized: User not found in database');
      return freshUser;
    },
    userProfile: async (_: any, __: any, context: { user?: IUserDocument }) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const freshUser = await UserModel.findOne({ userId: context.user.userId });
      if (!freshUser) throw new Error('Unauthorized: User not found in database');
      return freshUser;
    },
    walletSummary: async (_: any, __: any, context: { user?: IUserDocument }) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const user = await UserModel.findOne({ userId: context.user.userId });
      if (!user) throw new Error('Unauthorized: User not found in database');

      const investments = await InvestmentModel.find({ userId: user.userId });
      let activeInvestmentsSum = 0;
      let totalEarnings = 0;

      for (const inv of investments) {
        if (inv.status === 'active') {
          activeInvestmentsSum += inv.amount;
        }
        if (inv.status === 'settled') {
          totalEarnings += Math.max(0, inv.projectedReturn - inv.amount);
        }
      }

      const availableBalance = user.balance;
      const totalPortfolio = availableBalance + activeInvestmentsSum;

      return {
        totalPortfolio: Number(totalPortfolio.toFixed(2)),
        availableBalance: Number(availableBalance.toFixed(2)),
        activeInvestments: Number(activeInvestmentsSum.toFixed(2)),
        totalEarnings: Number(totalEarnings.toFixed(2)),
        growth24h: 0.0,
        currency: user.currencyPreference || 'USD',
      };
    },
    analyticsChart: async (_: any, { period }: { period?: string }, context: { user?: IUserDocument }) => {
      const balance = context.user ? context.user.balance : 0;
      return generateChartData(period || '1M', balance);
    },
    marketTickers: () => {
      return PLATFORM_MARKET_TICKERS;
    },
    depositMethods: () => {
      return PLATFORM_DEPOSIT_METHODS;
    },
    investmentPlans: async () => {
      const plans = await PlanModel.find({ status: 'active' });
      return plans.map((p) => ({
        id: p.planId,
        name: p.name,
        roi: p.roi,
        durationDays: p.durationDays,
        minAmount: p.minAmount,
        maxAmount: p.maxAmount,
        feeRate: p.feeRate,
        status: p.status,
      }));
    },
    userInvestments: async (_: any, __: any, context: { user?: IUserDocument }) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const invs = await InvestmentModel.find({ userId: context.user.userId }).sort({ createdAt: -1 });
      return invs.map((inv) => ({
        id: inv.investmentId,
        planName: inv.planName,
        amount: inv.amount,
        roi: inv.roi,
        progress: inv.progress,
        projectedReturn: inv.projectedReturn,
        status: inv.status,
        startDate: inv.startDate.toISOString(),
        maturityDate: inv.maturityDate.toISOString(),
      }));
    },
    transactions: async (
      _: any,
      { type, status, page, limit }: { type?: string; status?: string; page?: number; limit?: number },
      context: { user?: IUserDocument }
    ) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const filter: Record<string, any> = { userId: context.user.userId };

      if (type && type !== 'all') {
        filter.type = new RegExp(`^${type}$`, 'i');
      }
      if (status && status !== 'all') {
        filter.status = new RegExp(`^${status}$`, 'i');
      }

      const p = Math.max(1, page || 1);
      const l = Math.max(1, Math.min(100, limit || 20));
      const startIndex = (p - 1) * l;

      const txs = await TransactionModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(startIndex)
        .limit(l);

      return txs.map((tx) => ({
        id: tx.transactionId,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        plan: tx.plan,
        receiptImage: tx.receiptImage || '',
        date: tx.date || tx.createdAt.toISOString(),
      }));
    },
    notifications: async (_: any, __: any, context: { user?: IUserDocument }) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const notifs = await NotificationModel.find({ userId: context.user.userId }).sort({ createdAt: -1 });
      return notifs.map((n) => ({
        id: n.notificationId,
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      }));
    },
    adminUsers: async (_: any, __: any, context: { user?: IUserDocument }) => {
      if (!context.user || (context.user.role !== 'admin' && context.user.role !== 'sub-admin')) {
        throw new Error('Forbidden: Admin access required');
      }
      const users = await UserModel.find().sort({ createdAt: -1 });
      return users.map((u) => ({
        id: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        tier: u.tier,
        balance: u.balance,
        phone: u.phone,
        is2FAEnabled: u.is2FAEnabled,
        currencyPreference: u.currencyPreference,
        notifications: u.notifications,
        permissions: u.permissions,
        passwordHash: u.passwordHash,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt ? u.updatedAt.toISOString() : u.createdAt.toISOString(),
      }));
    },
    adminUser: async (_: any, { id, email }: { id?: string; email?: string }, context: { user?: IUserDocument }) => {
      if (!context.user || (context.user.role !== 'admin' && context.user.role !== 'sub-admin')) {
        throw new Error('Forbidden: Admin access required');
      }
      const conditions: any[] = [];
      if (id) conditions.push({ userId: id });
      if (email) conditions.push({ email: email.trim().toLowerCase() });
      if (conditions.length === 0) throw new Error('Must provide either id or email');
      const u = await UserModel.findOne({ $or: conditions });
      if (!u) throw new Error('User not found');
      return {
        id: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        tier: u.tier,
        balance: u.balance,
        phone: u.phone,
        is2FAEnabled: u.is2FAEnabled,
        currencyPreference: u.currencyPreference,
        notifications: u.notifications,
        permissions: u.permissions,
        passwordHash: u.passwordHash,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt ? u.updatedAt.toISOString() : u.createdAt.toISOString(),
      };
    },
    subAdmins: async () => {
      const subAdmins = await UserModel.find({ role: { $in: ['admin', 'sub-admin'] } }).sort({ createdAt: -1 });
      return subAdmins.map((u) => ({
        id: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        permissions: u.permissions,
        createdAt: u.createdAt.toISOString(),
      }));
    },
    adminDeposits: async () => {
      const deps = await DepositModel.find().sort({ createdAt: -1 });
      return deps.map((d) => ({
        id: d.depositId,
        userId: d.userId,
        userName: d.userName,
        userEmail: d.userEmail,
        type: d.type,
        amount: d.amount,
        method: d.method,
        currency: d.currency,
        transactionHash: d.transactionHash,
        receiptImage: d.receiptImage || '',
        status: d.status,
        createdAt: d.createdAt.toISOString(),
      }));
    },
    adminWithdrawals: async () => {
      const wdrs = await WithdrawalModel.find().sort({ createdAt: -1 });
      return wdrs.map((w) => ({
        id: w.withdrawalId,
        amount: w.amount,
        fee: w.fee,
        netPayout: w.netPayout,
        destinationAddress: w.destinationAddress,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      }));
    },
  },

  Mutation: {
    signup: async (_: any, { fullName, email, password }: { fullName?: string; email: string; password: string }) => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      const existingUser = await UserModel.findOne({ email: cleanEmail });
      if (existingUser) {
        throw new Error('An account with this email already exists');
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(cleanPassword, salt);
      const userId = `usr_${Math.floor(1000000 + Math.random() * 9000000)}`;

      const newUser = await UserModel.create({
        userId,
        name: (fullName || cleanEmail.split('@')[0] || 'Investor').trim(),
        email: cleanEmail,
        passwordHash,
        role: 'investor',
        tier: 'Tier 1 - Standard',
        balance: 0.0,
        phone: '',
        is2FAEnabled: false,
        currencyPreference: 'USD',
        notifications: { email: true, sms: false, yieldAlerts: false },
      });

      const token = generateToken(newUser);
      return { success: true, token, user: newUser };
    },

    login: async (_: any, { email, password }: { email: string; password: string }) => {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanPassword = String(password || '').trim();

      // Check MongoDB connection state (0: disconnected, 1: connected, 2: connecting, 3: disconnecting)
      const mongoStateNum = mongoose.connection.readyState;
      const mongoState =
        mongoStateNum === 1
          ? 'connected'
          : mongoStateNum === 2
          ? 'connecting'
          : mongoStateNum === 3
          ? 'disconnecting'
          : 'disconnected';

      // Query MongoDB Atlas via Mongoose UserModel (NOT from in-memory Map or db.json)
      const user = await UserModel.findOne({ email: cleanEmail });
      const userFound = Boolean(user);

      let passwordComparisonSucceeded = false;
      if (user && user.passwordHash) {
        const storedHash = String(user.passwordHash).trim();
        passwordComparisonSucceeded =
          bcrypt.compareSync(cleanPassword, storedHash) ||
          cleanPassword === storedHash;
      }

      // Safe debug logging: ONLY normalized email, userFound, passwordComparisonSucceeded, mongoState
      console.log(
        `[AUTH_DEBUG] GraphQL Login attempt | normalizedEmail: "${cleanEmail}" | userFound: ${userFound} | passwordMatch: ${passwordComparisonSucceeded} | mongoConnectionState: "${mongoState}"`
      );

      if (!user) {
        throw new Error('Invalid email or password');
      }

      if (!passwordComparisonSucceeded) {
        throw new Error('Invalid email or password');
      }

      const token = generateToken(user);
      return {
        success: true,
        token,
        user,
      };
    },

    updateProfile: async (
      _: any,
      args: { name?: string; phone?: string; is2FAEnabled?: boolean; currencyPreference?: string },
      context: { user?: IUserDocument }
    ) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const updates: Record<string, any> = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.phone !== undefined) updates.phone = args.phone;
      if (args.is2FAEnabled !== undefined) updates.is2FAEnabled = args.is2FAEnabled;
      if (args.currencyPreference !== undefined) updates.currencyPreference = args.currencyPreference;

      const updated = await UserModel.findOneAndUpdate(
        { userId: context.user.userId },
        { $set: updates },
        { new: true }
      );
      if (!updated) throw new Error('User not found in database');
      return updated;
    },

    createDeposit: async (
      _: any,
      {
        method,
        amount,
        currency,
        transactionHash,
        receiptImage,
      }: {
        method: string;
        amount: number;
        currency?: string;
        transactionHash?: string;
        receiptImage?: string;
      },
      context: { user?: IUserDocument }
    ) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const user = context.user;
      const selectedMethod = PLATFORM_DEPOSIT_METHODS.find((m) => m.id.toLowerCase() === method.toLowerCase());
      const methodName = selectedMethod ? selectedMethod.name : method.toUpperCase();
      const txId = `tx_dep_${Math.floor(10000 + Math.random() * 90000)}`;

      const depositTx = await DepositModel.create({
        depositId: txId,
        userId: user.userId,
        userName: user.name,
        userEmail: user.email,
        type: 'deposit',
        amount: Number(amount),
        method: methodName,
        currency: currency || 'USD',
        transactionHash: transactionHash || `0x${Math.random().toString(16).substring(2, 30)}`,
        receiptImage: receiptImage || '',
        status: 'pending',
      });

      await TransactionModel.create({
        transactionId: txId,
        userId: user.userId,
        type: 'deposit',
        amount: Number(amount),
        status: 'pending',
        plan: 'Direct Inflow',
        receiptImage: receiptImage || '',
        date: depositTx.createdAt.toISOString(),
      });

      return {
        id: depositTx.depositId,
        userId: depositTx.userId,
        userName: depositTx.userName,
        userEmail: depositTx.userEmail,
        type: depositTx.type,
        amount: depositTx.amount,
        method: depositTx.method,
        currency: depositTx.currency,
        transactionHash: depositTx.transactionHash,
        receiptImage: depositTx.receiptImage,
        status: depositTx.status,
        createdAt: depositTx.createdAt.toISOString(),
      };
    },

    createInvestment: async (
      _: any,
      { planId, planName, amount, roi }: { planId?: string; planName?: string; amount: number; roi?: string },
      context: { user?: IUserDocument }
    ) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const user = context.user;
      const invAmount = Number(amount);

      // Atomically check and deduct user balance
      const updatedUser = await UserModel.findOneAndUpdate(
        { userId: user.userId, balance: { $gte: invAmount } },
        { $inc: { balance: -invAmount } },
        { new: true }
      );

      if (!updatedUser) throw new Error('Insufficient balance for investment');

      const resolvedPlan = planId ? await PlanModel.findOne({ planId }) : null;
      const finalPlanName = planName || (resolvedPlan ? resolvedPlan.name : 'Apex Starter Tier');
      const finalRoi = roi || (resolvedPlan ? resolvedPlan.roi : '15%');
      const durationDays = resolvedPlan ? resolvedPlan.durationDays : 7;

      const invId = `inv_${Math.floor(1000 + Math.random() * 9000)}`;
      const startDate = new Date();
      const maturityDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      const roiPercent = parseFloat(finalRoi.replace('%', '')) || 15;
      const projectedReturn = Number((invAmount * (1 + roiPercent / 100)).toFixed(2));

      const newInvestment = await InvestmentModel.create({
        investmentId: invId,
        userId: user.userId,
        planId: planId || 'starter',
        planName: finalPlanName,
        amount: invAmount,
        roi: finalRoi,
        progress: 0,
        projectedReturn,
        status: 'active',
        startDate,
        maturityDate,
      });

      await TransactionModel.create({
        transactionId: `tx_${Math.floor(10000 + Math.random() * 90000)}`,
        userId: user.userId,
        type: 'investment',
        amount: invAmount,
        status: 'approved',
        plan: finalPlanName,
        date: startDate.toISOString(),
      });

      return {
        id: newInvestment.investmentId,
        planName: newInvestment.planName,
        amount: newInvestment.amount,
        roi: newInvestment.roi,
        progress: newInvestment.progress,
        projectedReturn: newInvestment.projectedReturn,
        status: newInvestment.status,
        startDate: newInvestment.startDate.toISOString(),
        maturityDate: newInvestment.maturityDate.toISOString(),
      };
    },

    settleInvestment: async (_: any, { id }: { id: string }, context: { user?: IUserDocument }) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const user = context.user;
      const inv = await InvestmentModel.findOne({ investmentId: id, userId: user.userId });
      if (!inv) throw new Error('Investment position not found');
      if (inv.status === 'settled') throw new Error('Investment is already settled');

      const payoutAmount = inv.projectedReturn || Number((inv.amount * 1.15).toFixed(2));
      inv.status = 'settled';
      inv.progress = 100;
      await inv.save();

      const updatedUser = await UserModel.findOneAndUpdate(
        { userId: user.userId },
        { $inc: { balance: payoutAmount } },
        { new: true }
      );

      const txId = `tx_settle_${Math.floor(10000 + Math.random() * 90000)}`;
      const nowIso = new Date().toISOString();

      await TransactionModel.create({
        transactionId: txId,
        userId: user.userId,
        type: 'investment',
        amount: payoutAmount,
        status: 'completed',
        plan: `${inv.planName} Settlement`,
        date: nowIso,
      });

      return {
        investmentId: inv.investmentId,
        payoutAmount: Number(payoutAmount.toFixed(2)),
        creditedBalance: Number(updatedUser?.balance.toFixed(2) || 0),
        transactionId: txId,
        status: 'completed',
      };
    },

    createWithdrawal: async (
      _: any,
      { amount, method, destinationAddress }: { amount: number; method?: string; destinationAddress: string; twoFactorCode?: string },
      context: { user?: IUserDocument }
    ) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      const user = context.user;
      const wdrAmount = Number(amount);
      const fee = 15.0;

      const updatedUser = await UserModel.findOneAndUpdate(
        { userId: user.userId, balance: { $gte: wdrAmount } },
        { $inc: { balance: -wdrAmount } },
        { new: true }
      );

      if (!updatedUser) throw new Error('Insufficient balance for withdrawal');

      const txId = `tx_wdr_${Math.floor(10000 + Math.random() * 90000)}`;
      const netPayout = Number((wdrAmount - fee).toFixed(2));

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

      await TransactionModel.create({
        transactionId: txId,
        userId: user.userId,
        type: 'withdrawal',
        amount: wdrAmount,
        status: 'pending',
        plan: 'External Payout',
        date: withdrawal.createdAt.toISOString(),
      });

      return {
        id: withdrawal.withdrawalId,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        netPayout: withdrawal.netPayout,
        destinationAddress: withdrawal.destinationAddress,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt.toISOString(),
      };
    },

    markNotificationRead: async (_: any, { id }: { id: string }, context: { user?: IUserDocument }) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      await NotificationModel.findOneAndUpdate(
        { notificationId: id, userId: context.user.userId },
        { isRead: true }
      );
      return true;
    },

    markAllNotificationsRead: async (_: any, __: any, context: { user?: IUserDocument }) => {
      if (!context.user) throw new Error('Unauthorized: Missing or invalid token');
      await NotificationModel.updateMany({ userId: context.user.userId }, { isRead: true });
      return true;
    },

    adminUpdateDepositStatus: async (_: any, { id, status }: { id: string; status: string }) => {
      const deposit = await DepositModel.findOne({ depositId: id });
      if (!deposit) throw new Error('Deposit transaction not found');

      const prevStatus = deposit.status;
      const targetStatus = status.toLowerCase() as 'pending' | 'approved' | 'rejected';
      deposit.status = targetStatus;
      await deposit.save();

      if (prevStatus !== 'approved' && targetStatus === 'approved') {
        await UserModel.findOneAndUpdate(
          { userId: deposit.userId },
          { $inc: { balance: deposit.amount } }
        );
      }

      await TransactionModel.findOneAndUpdate(
        { transactionId: id },
        { status: targetStatus }
      );

      return {
        id: deposit.depositId,
        userId: deposit.userId,
        userName: deposit.userName,
        userEmail: deposit.userEmail,
        type: deposit.type,
        amount: deposit.amount,
        method: deposit.method,
        currency: deposit.currency,
        transactionHash: deposit.transactionHash,
        receiptImage: deposit.receiptImage || '',
        status: deposit.status,
        createdAt: deposit.createdAt.toISOString(),
      };
    },

    adminUpdateWithdrawalStatus: async (_: any, { id, status, txHash }: { id: string; status: string; txHash?: string }) => {
      const withdrawal = await WithdrawalModel.findOne({ withdrawalId: id });
      if (!withdrawal) throw new Error('Withdrawal request not found');

      const prevStatus = withdrawal.status;
      const targetStatus = status.toLowerCase() as 'pending' | 'processed' | 'rejected';
      withdrawal.status = targetStatus;
      if (txHash) withdrawal.txHash = txHash;
      await withdrawal.save();

      if (prevStatus !== 'rejected' && targetStatus === 'rejected') {
        await UserModel.findOneAndUpdate(
          { userId: withdrawal.userId },
          { $inc: { balance: withdrawal.amount } }
        );
      }

      await TransactionModel.findOneAndUpdate(
        { transactionId: id },
        { status: targetStatus }
      );

      return {
        id: withdrawal.withdrawalId,
        amount: withdrawal.amount,
        fee: withdrawal.fee,
        netPayout: withdrawal.netPayout,
        destinationAddress: withdrawal.destinationAddress,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt.toISOString(),
      };
    },

    adminUpdatePlan: async (_: any, { id, roi, minAmount, maxAmount, feeRate }: { id: string; roi?: string; minAmount?: number; maxAmount?: number; feeRate?: number }) => {
      const updates: Record<string, any> = {};
      if (roi !== undefined) updates.roi = roi;
      if (minAmount !== undefined) updates.minAmount = minAmount;
      if (maxAmount !== undefined) updates.maxAmount = maxAmount;
      if (feeRate !== undefined) updates.feeRate = feeRate;

      const plan = await PlanModel.findOneAndUpdate(
        { planId: id },
        {
          $set: updates,
          $setOnInsert: {
            planId: id,
            name: `Apex Plan ${id.toUpperCase()}`,
            roi: roi || '15%',
            durationDays: 7,
            minAmount: minAmount || 500,
            maxAmount: maxAmount || 10000,
            feeRate: feeRate || 0.1,
            status: 'active',
          },
        },
        { upsert: true, new: true }
      );

      return {
        id: plan.planId,
        name: plan.name,
        roi: plan.roi,
        durationDays: plan.durationDays,
        minAmount: plan.minAmount,
        maxAmount: plan.maxAmount,
        feeRate: plan.feeRate,
        status: plan.status,
      };
    },

    adminAdjustUserBalance: async (
      _: any,
      { email, action, amount, reason }: { email: string; action: string; amount: number; reason?: string }
    ) => {
      const cleanEmail = email.trim().toLowerCase();
      const user = await UserModel.findOne({ email: cleanEmail });
      if (!user) {
        throw new Error(`User with email '${cleanEmail}' not found`);
      }

      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error('Valid positive amount is required');
      }

      const normalizedAction = (action || '').toLowerCase().trim();
      const INCREMENT_ACTIONS = new Set(['increase', 'increment', 'add', 'credit', 'up', '+']);
      const DECREMENT_ACTIONS = new Set(['decrease', 'decrement', 'deduct', 'subtract', 'debit', 'down', '-']);

      if (!INCREMENT_ACTIONS.has(normalizedAction) && !DECREMENT_ACTIONS.has(normalizedAction)) {
        throw new Error(
          `Invalid action '${action}'. Use 'increase' (or 'increment', 'add', 'up') to go up, or 'decrease' (or 'decrement', 'deduct', 'down') to go down.`
        );
      }

      const isIncrement = INCREMENT_ACTIONS.has(normalizedAction);
      const previousBalance = user.balance;

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

      await TransactionModel.create({
        transactionId: txId,
        userId: user.userId,
        type: isIncrement ? 'deposit' : 'withdrawal',
        amount: numericAmount,
        status: 'completed',
        plan: `${finalReason} (${adjustmentFormatted})`,
        date: now.toISOString(),
      });

      const notifId = `notif_${Math.floor(10000 + Math.random() * 90000)}`;
      await NotificationModel.create({
        notificationId: notifId,
        userId: user.userId,
        title: isIncrement ? 'Funds Added to Wallet' : 'Funds Deducted from Wallet',
        message: `An administrative balance adjustment of ${adjustmentFormatted} USD was applied to your account. New Balance: $${user.balance.toFixed(2)} USD.`,
        type: isIncrement ? 'deposit' : 'withdrawal',
        isRead: false,
      });

      return {
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
      };
    },

    adminResetUserPassword: async (
      _: any,
      { userId, newPassword }: { userId: string; newPassword: string },
      context: { user?: IUserDocument }
    ) => {
      if (!context.user || context.user.role !== 'admin') {
        throw new Error('Forbidden: Only an admin can reset user passwords');
      }
      if (!newPassword || newPassword.trim().length === 0) {
        throw new Error('New password cannot be empty');
      }
      const user = await UserModel.findOne({ userId });
      if (!user) throw new Error('User not found');
      const salt = bcrypt.genSaltSync(10);
      user.passwordHash = bcrypt.hashSync(newPassword.trim(), salt);
      await user.save();
      return true;
    },

    createSubAdmin: async (
      _: any,
      { fullName, email, password, permissions, role }: any,
      context: { user?: IUserDocument }
    ) => {
      if (!context.user || context.user.role !== 'admin') {
        throw new Error('Forbidden: Only an admin can create sub-admins');
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanPassword = String(password).trim();
      const existing = await UserModel.findOne({ email: cleanEmail });
      if (existing) {
        throw new Error(`An account with email '${cleanEmail}' already exists`);
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
        name: (fullName || cleanEmail.split('@')[0] || 'Sub Admin').trim(),
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

      return newSubAdmin;
    },
  },
};
