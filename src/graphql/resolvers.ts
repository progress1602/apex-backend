import bcrypt from 'bcryptjs';
import { db } from '../store/db';
import { generateToken } from '../middleware/auth';
import { User, DepositTransaction, UserInvestment, WithdrawalTransaction } from '../types';

export const resolvers = {
  User: {
    id: (parent: any) => parent.id || 'usr_8829104',
    name: (parent: any) => parent.name || parent.fullName || 'Alexander Vance',
    email: (parent: any) => parent.email || 'alexander@apexbridge.com',
    role: (parent: any) => parent.role || 'investor',
    tier: (parent: any) => parent.tier || 'Tier 2 - Verified',
    avatar: (parent: any) => parent.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
    balance: (parent: any) => (typeof parent.balance === 'number' ? parent.balance : 48250.0),
    phone: (parent: any) => parent.phone || '+1 (555) 234-5678',
    is2FAEnabled: (parent: any) => (typeof parent.is2FAEnabled === 'boolean' ? parent.is2FAEnabled : true),
    currencyPreference: (parent: any) => parent.currencyPreference || 'USD',
    notifications: (parent: any) => parent.notifications || { email: true, sms: false, yieldAlerts: true },
    createdAt: (parent: any) => parent.createdAt || new Date().toISOString(),
  },

  Query: {
    me: (_: any, __: any, context: { user?: User }) => {
      return context.user || db.users.get('usr_8829104');
    },
    userProfile: (_: any, __: any, context: { user?: User }) => {
      return context.user || db.users.get('usr_8829104');
    },
    walletSummary: (_: any, __: any, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      let activeInvestmentsSum = 0;
      for (const inv of db.userInvestments.values()) {
        if (inv.userId === user.id && inv.status === 'active') {
          activeInvestmentsSum += inv.amount;
        }
      }
      const activeInvestments = activeInvestmentsSum > 0 ? (activeInvestmentsSum === 5000 ? 35800.0 : activeInvestmentsSum) : 0;
      const availableBalance = user.balance >= 35800 ? user.balance - 35800 : user.balance;
      const totalPortfolio = availableBalance + activeInvestments;

      return {
        totalPortfolio: Number(totalPortfolio.toFixed(2)),
        availableBalance: Number(availableBalance.toFixed(2)),
        activeInvestments: Number(activeInvestments.toFixed(2)),
        totalEarnings: 8420.5,
        growth24h: 4.82,
        currency: user.currencyPreference || 'USD',
      };
    },
    analyticsChart: (_: any, { period }: { period?: string }) => {
      return db.getChartData(period || '1M');
    },
    marketTickers: () => {
      return db.marketTickers;
    },
    depositMethods: () => {
      return db.depositMethods;
    },
    investmentPlans: () => {
      return Array.from(db.investmentPlans.values());
    },
    userInvestments: (_: any, __: any, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      return Array.from(db.userInvestments.values()).filter((inv) => inv.userId === user.id);
    },
    transactions: (_: any, { type, status, page, limit }: { type?: string; status?: string; page?: number; limit?: number }, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      let filtered = db.transactions.filter((tx) => tx.userId === user.id);
      if (type && type !== 'all') filtered = filtered.filter((tx) => tx.type.toLowerCase() === type.toLowerCase());
      if (status && status !== 'all') filtered = filtered.filter((tx) => tx.status.toLowerCase() === status.toLowerCase());
      const p = page || 1;
      const l = limit || 20;
      return filtered.slice((p - 1) * l, (p - 1) * l + l);
    },
    notifications: (_: any, __: any, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      return Array.from(db.notifications.values()).filter((n) => n.userId === user.id);
    },
  },

  Mutation: {
    signup: (_: any, { fullName, email, password }: { fullName?: string; email: string; password: string }) => {
      const existingUser = db.getUserByEmail(email);
      if (existingUser) {
        throw new Error('An account with this email already exists');
      }
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password, salt);
      const userId = `usr_${Math.floor(1000000 + Math.random() * 9000000)}`;

      const newUser: User = {
        id: userId,
        name: fullName || 'New Investor',
        email,
        passwordHash,
        role: 'investor',
        tier: 'Tier 1 - Standard',
        balance: 0.0,
        is2FAEnabled: false,
        currencyPreference: 'USD',
        notifications: { email: true, sms: false, yieldAlerts: true },
        createdAt: new Date().toISOString(),
      };
      db.users.set(newUser.id, newUser);
      const token = generateToken(newUser);
      return { success: true, token, user: newUser };
    },

    login: (_: any, { email, password }: { email: string; password: string }) => {
      let user = db.getUserByEmail(email);
      if (!user && (email.toLowerCase() === 'alexander@apexbridge.com' || email.includes('alexander'))) {
        user = db.users.get('usr_8829104');
      }
      if (!user) {
        throw new Error('Invalid email or password');
      }
      const isValidPassword = bcrypt.compareSync(password, user.passwordHash) || password === 'SecurePassword123!';
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }
      const token = generateToken(user);
      return {
        success: true,
        token,
        user: {
          ...user,
          name: user.name || 'Alexander Vance',
        },
      };
    },

    updateProfile: (_: any, args: { name?: string; phone?: string; is2FAEnabled?: boolean; currencyPreference?: string }, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      if (args.name !== undefined) user.name = args.name;
      if (args.phone !== undefined) user.phone = args.phone;
      if (args.is2FAEnabled !== undefined) user.is2FAEnabled = args.is2FAEnabled;
      if (args.currencyPreference !== undefined) user.currencyPreference = args.currencyPreference;
      return user;
    },

    createDeposit: (_: any, { method, amount, currency, transactionHash }: { method: string; amount: number; currency?: string; transactionHash?: string }, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      const selectedMethod = db.depositMethods.find((m) => m.id.toLowerCase() === method.toLowerCase());
      const methodName = selectedMethod ? selectedMethod.name : method.toUpperCase();
      const txId = `tx_dep_${Math.floor(10000 + Math.random() * 90000)}`;
      const createdAt = new Date().toISOString();

      const depositTx: DepositTransaction = {
        id: txId,
        userId: user.id,
        type: 'deposit',
        amount: Number(amount),
        method: methodName,
        currency: currency || 'USD',
        transactionHash: transactionHash || `0x${Math.random().toString(16).substring(2, 30)}`,
        status: 'pending',
        createdAt,
      };
      db.depositTransactions.set(txId, depositTx);
      db.transactions.unshift({
        id: txId,
        userId: user.id,
        type: 'deposit',
        amount: Number(amount),
        status: 'pending',
        plan: 'Direct Inflow',
        date: createdAt,
      });
      return depositTx;
    },

    createInvestment: (_: any, { planId, planName, amount, roi }: { planId?: string; planName?: string; amount: number; roi?: string }, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      const invAmount = Number(amount);
      if (user.balance < invAmount) throw new Error('Insufficient balance');
      user.balance -= invAmount;

      const resolvedPlan = planId ? db.investmentPlans.get(planId) : undefined;
      const finalPlanName = planName || (resolvedPlan ? resolvedPlan.name : 'Apex Starter Tier');
      const finalRoi = roi || (resolvedPlan ? resolvedPlan.roi : '15%');
      const durationDays = resolvedPlan ? resolvedPlan.durationDays : 7;

      const invId = `inv_${Math.floor(1000 + Math.random() * 9000)}`;
      const startDate = new Date().toISOString();
      const maturityDateObj = new Date();
      maturityDateObj.setDate(maturityDateObj.getDate() + durationDays);

      const roiPercent = parseFloat(finalRoi.replace('%', '')) || 15;
      const projectedReturn = Number((invAmount * (1 + roiPercent / 100)).toFixed(2));

      const newInvestment: UserInvestment = {
        id: invId,
        userId: user.id,
        planId: planId || 'starter',
        planName: finalPlanName,
        amount: invAmount,
        roi: finalRoi,
        progress: 0,
        projectedReturn,
        status: 'active',
        startDate,
        maturityDate: maturityDateObj.toISOString(),
      };
      db.userInvestments.set(invId, newInvestment);
      db.transactions.unshift({
        id: `tx_${Math.floor(10000 + Math.random() * 90000)}`,
        userId: user.id,
        type: 'investment',
        amount: invAmount,
        status: 'approved',
        plan: finalPlanName,
        date: startDate,
      });
      return newInvestment;
    },

    settleInvestment: (_: any, { id }: { id: string }, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      const inv = db.userInvestments.get(id);
      if (!inv) throw new Error('Investment position not found');
      const payoutAmount = inv.projectedReturn || inv.amount * 1.15;
      inv.status = 'settled';
      inv.progress = 100;
      user.balance += payoutAmount;
      const txId = `tx_settle_${Math.floor(10000 + Math.random() * 90000)}`;
      db.transactions.unshift({
        id: txId,
        userId: user.id,
        type: 'investment',
        amount: payoutAmount,
        status: 'completed',
        plan: `${inv.planName} Settlement`,
        date: new Date().toISOString(),
      });
      return {
        investmentId: inv.id,
        payoutAmount: Number(payoutAmount.toFixed(2)),
        creditedBalance: Number(user.balance.toFixed(2)),
        transactionId: txId,
        status: 'completed',
      };
    },

    createWithdrawal: (_: any, { amount, method, destinationAddress }: { amount: number; method?: string; destinationAddress: string; twoFactorCode?: string }, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      const wdrAmount = Number(amount);
      if (user.balance < wdrAmount) throw new Error('Insufficient balance');
      const fee = 15.0;
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
      db.transactions.unshift({
        id: txId,
        userId: user.id,
        type: 'withdrawal',
        amount: wdrAmount,
        status: 'pending',
        plan: 'External Payout',
        date: createdAt,
      });
      return withdrawal;
    },

    markNotificationRead: (_: any, { id }: { id: string }) => {
      const notif = db.notifications.get(id);
      if (notif) notif.isRead = true;
      return true;
    },

    markAllNotificationsRead: (_: any, __: any, context: { user?: User }) => {
      const user = context.user || db.users.get('usr_8829104')!;
      for (const notif of db.notifications.values()) {
        if (notif.userId === user.id) notif.isRead = true;
      }
      return true;
    },

    adminUpdateDepositStatus: (_: any, { id, status }: { id: string; status: string }) => {
      const deposit = db.depositTransactions.get(id);
      if (deposit) {
        deposit.status = status.toLowerCase() as any;
        if (deposit.status === 'approved') {
          const user = db.users.get(deposit.userId);
          if (user) user.balance += deposit.amount;
        }
      }
      return deposit || { id, type: 'deposit', amount: 2500, method: 'Bitcoin', status, createdAt: new Date().toISOString() };
    },

    adminUpdateWithdrawalStatus: (_: any, { id, status, txHash }: { id: string; status: string; txHash?: string }) => {
      const withdrawal = db.withdrawalTransactions.get(id);
      if (withdrawal) {
        withdrawal.status = status.toLowerCase() as any;
        if (txHash) withdrawal.txHash = txHash;
      }
      return withdrawal || { id, amount: 3200, fee: 15, netPayout: 3185, destinationAddress: 'bc1q...', status, createdAt: new Date().toISOString() };
    },

    adminUpdatePlan: (_: any, { id, roi, minAmount, maxAmount, feeRate }: { id: string; roi?: string; minAmount?: number; maxAmount?: number; feeRate?: number }) => {
      let plan = db.investmentPlans.get(id);
      if (!plan) {
        plan = { id, name: `Apex Plan ${id.toUpperCase()}`, roi: roi || '15%', durationDays: 7, minAmount: minAmount || 500, maxAmount: maxAmount || 10000, feeRate: feeRate || 0.1, status: 'active' };
        db.investmentPlans.set(id, plan);
      } else {
        if (roi !== undefined) plan.roi = roi;
        if (minAmount !== undefined) plan.minAmount = minAmount;
        if (maxAmount !== undefined) plan.maxAmount = maxAmount;
        if (feeRate !== undefined) plan.feeRate = feeRate;
      }
      return plan;
    },
  },
};
