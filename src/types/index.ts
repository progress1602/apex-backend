export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'investor' | 'admin';
  tier: string;
  avatar?: string;
  balance: number;
  phone?: string;
  is2FAEnabled: boolean;
  currencyPreference: string;
  notifications: {
    email: boolean;
    sms: boolean;
    yieldAlerts: boolean;
  };
  createdAt: string;
}

export interface WalletSummary {
  totalPortfolio: number;
  availableBalance: number;
  activeInvestments: number;
  totalEarnings: number;
  growth24h: number;
  currency: string;
}

export interface ChartDataPoint {
  timestamp: string;
  value: number;
}

export interface MarketTicker {
  symbol: string;
  price: number;
  change24h: number;
}

export interface DepositMethod {
  id: string;
  name: string;
  network: string;
  address: string;
  minDeposit: number;
  confirmationsRequired: number;
}

export interface DepositTransaction {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  type: 'deposit';
  amount: number;
  method: string;
  currency: string;
  transactionHash?: string;
  receiptImage?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface InvestmentPlan {
  id: string;
  name: string;
  roi: string;
  durationDays: number;
  minAmount: number;
  maxAmount: number;
  feeRate: number;
  status: 'active' | 'inactive';
}

export interface UserInvestment {
  id: string;
  userId: string;
  planId?: string;
  planName: string;
  amount: number;
  roi: string;
  progress: number;
  projectedReturn: number;
  status: 'active' | 'completed' | 'settled';
  startDate: string;
  maturityDate: string;
}

export interface WithdrawalTransaction {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  type: 'withdrawal';
  amount: number;
  fee: number;
  netPayout: number;
  method: string;
  destinationAddress: string;
  status: 'pending' | 'processed' | 'rejected';
  createdAt: string;
  txHash?: string;
}

export interface TransactionLedgerItem {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'investment';
  amount: number;
  status: 'pending' | 'approved' | 'completed' | 'rejected' | 'processed';
  plan: string;
  receiptImage?: string;
  date: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'yield' | 'deposit' | 'withdrawal' | 'security' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: string;
}
