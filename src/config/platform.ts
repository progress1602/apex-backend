import { DepositMethod, MarketTicker, ChartDataPoint } from '../types';

export const PLATFORM_DEPOSIT_METHODS: DepositMethod[] = [
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

export const PLATFORM_DEFAULT_PLANS = [
  {
    planId: 'starter',
    name: 'Apex Starter Tier',
    roi: '15%',
    durationDays: 7,
    minAmount: 500,
    maxAmount: 4999,
    feeRate: 0.1,
    status: 'active',
  },
  {
    planId: 'vault',
    name: 'Quantum Yield Vault',
    roi: '35%',
    durationDays: 14,
    minAmount: 5000,
    maxAmount: 24999,
    feeRate: 0.1,
    status: 'active',
  },
  {
    planId: 'institutional',
    name: 'Sovereign Institutional Core',
    roi: '75%',
    durationDays: 30,
    minAmount: 25000,
    maxAmount: 1000000,
    feeRate: 0.1,
    status: 'active',
  },
];

export const PLATFORM_MARKET_TICKERS: MarketTicker[] = [
  { symbol: 'BTC/USD', price: 89450.0, change24h: 3.4 },
  { symbol: 'ETH/USD', price: 4280.0, change24h: -1.2 },
  { symbol: 'SOL/USD', price: 210.5, change24h: 6.8 },
];

export function generateChartData(period: string = '1M', currentBalance: number = 0): ChartDataPoint[] {
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
