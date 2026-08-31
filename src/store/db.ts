import bcrypt from 'bcryptjs';
import {
  User,
  DepositMethod,
  DepositTransaction,
  InvestmentPlan,
  UserInvestment,
  WithdrawalTransaction,
  TransactionLedgerItem,
  NotificationItem,
  MarketTicker,
  ChartDataPoint,
} from '../types';

class DataStore {
  public users: Map<string, User> = new Map();
  public depositMethods: DepositMethod[] = [];
  public depositTransactions: Map<string, DepositTransaction> = new Map();
  public investmentPlans: Map<string, InvestmentPlan> = new Map();
  public userInvestments: Map<string, UserInvestment> = new Map();
  public withdrawalTransactions: Map<string, WithdrawalTransaction> = new Map();
  public transactions: TransactionLedgerItem[] = [];
  public notifications: Map<string, NotificationItem> = new Map();
  public marketTickers: MarketTicker[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    // 1. Pre-seed Default User (Alexander Vance)
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('SecurePassword123!', salt);

    const alexander: User = {
      id: 'usr_8829104',
      name: 'Alexander Vance',
      email: 'alexander@apexbridge.com',
      passwordHash,
      role: 'investor',
      tier: 'Tier 2 - Verified',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
      balance: 48250.0,
      phone: '+1 (555) 234-5678',
      is2FAEnabled: true,
      currencyPreference: 'USD',
      notifications: {
        email: true,
        sms: false,
        yieldAlerts: true,
      },
      createdAt: '2026-08-30T10:00:00Z',
    };
    this.users.set(alexander.id, alexander);

    // 2. Pre-seed Deposit Methods
    this.depositMethods = [
      {
        id: 'btc',
        name: 'Bitcoin (BTC)',
        network: 'Bitcoin Mainnet',
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        minDeposit: 50.0,
        confirmationsRequired: 2,
      },
      {
        id: 'eth',
        name: 'Ethereum (ETH)',
        network: 'ERC-20',
        address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
        minDeposit: 50.0,
        confirmationsRequired: 12,
      },
      {
        id: 'usdt',
        name: 'Tether (USDT)',
        network: 'TRC-20',
        address: 'TXbQn3yXb34zX23438zFDCBD38C102D88',
        minDeposit: 50.0,
        confirmationsRequired: 1,
      },
      {
        id: 'sol',
        name: 'Solana (SOL)',
        network: 'Solana Mainnet',
        address: 'Sol1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        minDeposit: 20.0,
        confirmationsRequired: 1,
      },
    ];

    // 3. Pre-seed Investment Plans
    const plans: InvestmentPlan[] = [
      {
        id: 'starter',
        name: 'Apex Starter Tier',
        roi: '15%',
        durationDays: 7,
        minAmount: 500,
        maxAmount: 4999,
        feeRate: 0.1,
        status: 'active',
      },
      {
        id: 'vault',
        name: 'Quantum Yield Vault',
        roi: '35%',
        durationDays: 14,
        minAmount: 5000,
        maxAmount: 24999,
        feeRate: 0.1,
        status: 'active',
      },
      {
        id: 'institutional',
        name: 'Sovereign Institutional Core',
        roi: '75%',
        durationDays: 30,
        minAmount: 25000,
        maxAmount: 1000000,
        feeRate: 0.1,
        status: 'active',
      },
    ];
    for (const p of plans) {
      this.investmentPlans.set(p.id, p);
    }

    // 4. Pre-seed User Active Investment
    const inv1: UserInvestment = {
      id: 'inv_7721',
      userId: alexander.id,
      planId: 'starter',
      planName: 'Apex Starter Tier',
      amount: 5000.0,
      roi: '15%',
      progress: 74.2,
      projectedReturn: 5750.0,
      status: 'active',
      startDate: '2026-08-25T00:00:00Z',
      maturityDate: '2026-09-01T00:00:00Z',
    };
    this.userInvestments.set(inv1.id, inv1);

    // 5. Pre-seed Ledger Transactions
    this.transactions = [
      {
        id: 'tx_99120',
        userId: alexander.id,
        type: 'deposit',
        amount: 2500.0,
        status: 'approved',
        plan: 'Direct Inflow',
        date: '2026-08-30T14:20:00Z',
      },
      {
        id: 'tx_99121',
        userId: alexander.id,
        type: 'investment',
        amount: 5000.0,
        status: 'approved',
        plan: 'Apex Starter Tier',
        date: '2026-08-25T11:00:00Z',
      },
      {
        id: 'tx_99122',
        userId: alexander.id,
        type: 'withdrawal',
        amount: 1200.0,
        status: 'pending',
        plan: 'External Payout',
        date: '2026-08-24T09:15:00Z',
      },
    ];

    // 6. Pre-seed Notifications
    const notifs: NotificationItem[] = [
      {
        id: 'notif_001',
        userId: alexander.id,
        title: 'Yield Cycle Complete',
        message: 'Your Apex Starter Tier position has matured with +15% ROI.',
        type: 'yield',
        isRead: false,
        createdAt: '2026-08-30T20:00:00Z',
      },
      {
        id: 'notif_002',
        userId: alexander.id,
        title: 'Deposit Confirmed',
        message: 'Deposit of 2,500.00 USD (BTC) has been credited.',
        type: 'deposit',
        isRead: true,
        createdAt: '2026-08-30T14:22:00Z',
      },
    ];
    for (const n of notifs) {
      this.notifications.set(n.id, n);
    }

    // 7. Pre-seed Market Tickers
    this.marketTickers = [
      { symbol: 'BTC/USD', price: 89450.0, change24h: 3.4 },
      { symbol: 'ETH/USD', price: 4280.0, change24h: -1.2 },
      { symbol: 'SOL/USD', price: 210.5, change24h: 6.8 },
    ];
  }

  public getUserByEmail(email: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return user;
      }
    }
    return undefined;
  }

  public getChartData(period: string = '1M'): ChartDataPoint[] {
    const p = period.toUpperCase();
    if (p === '1D') {
      return [
        { timestamp: '2026-08-30T00:00:00Z', value: 47900.0 },
        { timestamp: '2026-08-30T06:00:00Z', value: 48050.0 },
        { timestamp: '2026-08-30T12:00:00Z', value: 48120.0 },
        { timestamp: '2026-08-30T18:00:00Z', value: 48250.0 },
      ];
    } else if (p === '1W') {
      return [
        { timestamp: '2026-08-24T00:00:00Z', value: 41200.0 },
        { timestamp: '2026-08-25T00:00:00Z', value: 42900.0 },
        { timestamp: '2026-08-26T00:00:00Z', value: 44100.0 },
        { timestamp: '2026-08-27T00:00:00Z', value: 45300.0 },
        { timestamp: '2026-08-28T00:00:00Z', value: 46800.0 },
        { timestamp: '2026-08-29T00:00:00Z', value: 47500.0 },
        { timestamp: '2026-08-30T00:00:00Z', value: 48250.0 },
      ];
    } else if (p === '1Y') {
      return [
        { timestamp: '2025-08-30T00:00:00Z', value: 15000.0 },
        { timestamp: '2025-11-30T00:00:00Z', value: 22000.0 },
        { timestamp: '2026-02-28T00:00:00Z', value: 31500.0 },
        { timestamp: '2026-05-30T00:00:00Z', value: 39000.0 },
        { timestamp: '2026-08-30T00:00:00Z', value: 48250.0 },
      ];
    } else if (p === 'ALL') {
      return [
        { timestamp: '2024-01-01T00:00:00Z', value: 5000.0 },
        { timestamp: '2025-01-01T00:00:00Z', value: 18000.0 },
        { timestamp: '2026-01-01T00:00:00Z', value: 29500.0 },
        { timestamp: '2026-08-30T00:00:00Z', value: 48250.0 },
      ];
    }

    // Default 1M
    return [
      { timestamp: '2026-08-24T00:00:00Z', value: 41200.0 },
      { timestamp: '2026-08-25T00:00:00Z', value: 42900.0 },
      { timestamp: '2026-08-26T00:00:00Z', value: 44100.0 },
      { timestamp: '2026-08-30T00:00:00Z', value: 48250.0 },
    ];
  }
}

export const db = new DataStore();
