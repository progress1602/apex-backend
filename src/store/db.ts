import fs from 'fs';
import path from 'path';
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

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

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
    this.seedPlatformConfig();
    this.loadFromDisk();
  }

  private seedPlatformConfig() {
    // 1. Available Cryptocurrency Deposit Methods
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

    // 2. Active Investment Plans
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

    // 3. Real-time Market Tickers
    this.marketTickers = [
      { symbol: 'BTC/USD', price: 89450.0, change24h: 3.4 },
      { symbol: 'ETH/USD', price: 4280.0, change24h: -1.2 },
      { symbol: 'SOL/USD', price: 210.5, change24h: 6.8 },
    ];
  }

  public saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        users: Array.from(this.users.entries()),
        depositTransactions: Array.from(this.depositTransactions.entries()),
        userInvestments: Array.from(this.userInvestments.entries()),
        withdrawalTransactions: Array.from(this.withdrawalTransactions.entries()),
        transactions: this.transactions,
        notifications: Array.from(this.notifications.entries()),
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist database to disk:', err);
    }
  }

  public loadFromDisk() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(raw);

        if (Array.isArray(data.users)) {
          this.users = new Map(data.users);
        }
        if (Array.isArray(data.depositTransactions)) {
          this.depositTransactions = new Map(data.depositTransactions);
        }
        if (Array.isArray(data.userInvestments)) {
          this.userInvestments = new Map(data.userInvestments);
        }
        if (Array.isArray(data.withdrawalTransactions)) {
          this.withdrawalTransactions = new Map(data.withdrawalTransactions);
        }
        if (Array.isArray(data.transactions)) {
          this.transactions = data.transactions;
        }
        if (Array.isArray(data.notifications)) {
          this.notifications = new Map(data.notifications);
        }
      }
    } catch (err) {
      console.error('Failed to load database from disk:', err);
    }
  }

  public getUserByEmail(email: string): User | undefined {
    if (!email) return undefined;
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email && user.email.trim().toLowerCase() === normalized) {
        return user;
      }
    }
    return undefined;
  }

  public getChartData(period: string = '1M', currentBalance: number = 0): ChartDataPoint[] {
    const now = new Date();
    const points: ChartDataPoint[] = [];
    const count = period === '1D' ? 4 : period === '1W' ? 7 : period === '1Y' ? 12 : 30;

    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      points.push({
        timestamp: d.toISOString(),
        value: currentBalance,
      });
    }

    return points;
  }
}

export const db = new DataStore();
