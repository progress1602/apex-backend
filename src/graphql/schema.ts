export const typeDefs = `#graphql
  type UserNotifications {
    email: Boolean
    sms: Boolean
    yieldAlerts: Boolean
  }

  type User {
    id: ID
    name: String
    email: String
    role: String
    tier: String
    avatar: String
    balance: Float
    phone: String
    is2FAEnabled: Boolean
    currencyPreference: String
    notifications: UserNotifications
    permissions: [String]
    createdAt: String
  }

  type AuthPayload {
    success: Boolean
    token: String
    user: User
  }

  type WalletSummary {
    totalPortfolio: Float
    availableBalance: Float
    activeInvestments: Float
    totalEarnings: Float
    growth24h: Float
    currency: String
  }

  type ChartDataPoint {
    timestamp: String
    value: Float
  }

  type MarketTicker {
    symbol: String
    price: Float
    change24h: Float
  }

  type DepositMethod {
    id: ID
    name: String
    network: String
    address: String
    minDeposit: Float
    confirmationsRequired: Int
  }

  type DepositTransaction {
    id: ID
    userId: String
    userName: String
    userEmail: String
    type: String
    amount: Float
    method: String
    currency: String
    transactionHash: String
    receiptImage: String
    status: String
    createdAt: String
  }

  type InvestmentPlan {
    id: ID
    name: String
    roi: String
    durationDays: Int
    minAmount: Float
    maxAmount: Float
    feeRate: Float
    status: String
  }

  type UserInvestment {
    id: ID
    planName: String
    amount: Float
    roi: String
    progress: Float
    projectedReturn: Float
    status: String
    startDate: String
    maturityDate: String
  }

  type SettlementResult {
    investmentId: ID
    payoutAmount: Float
    creditedBalance: Float
    transactionId: ID
    status: String
  }

  type WithdrawalResult {
    id: ID
    amount: Float
    fee: Float
    netPayout: Float
    destinationAddress: String
    status: String
    createdAt: String
  }

  type TransactionItem {
    id: ID
    type: String
    amount: Float
    status: String
    plan: String
    receiptImage: String
    date: String
  }

  type NotificationItem {
    id: ID
    title: String
    message: String
    type: String
    isRead: Boolean
    createdAt: String
  }

  type AdminBalanceAdjustData {
    userId: String
    name: String
    email: String
    previousBalance: Float
    newBalance: Float
    action: String
    amount: Float
    reason: String
    transactionId: String
  }

  type AdminBalanceAdjustResult {
    success: Boolean!
    message: String!
    data: AdminBalanceAdjustData
  }

  type Query {
    me: User
    userProfile: User
    walletSummary: WalletSummary
    analyticsChart(period: String): [ChartDataPoint]
    marketTickers: [MarketTicker]
    depositMethods: [DepositMethod]
    investmentPlans: [InvestmentPlan]
    userInvestments: [UserInvestment]
    transactions(type: String, status: String, page: Int, limit: Int): [TransactionItem]
    notifications: [NotificationItem]
    adminUsers: [User]
    subAdmins: [User]
    adminDeposits: [DepositTransaction]
    adminWithdrawals: [WithdrawalResult]
  }

  type Mutation {
    signup(fullName: String, email: String!, password: String!): AuthPayload
    login(email: String!, password: String!): AuthPayload
    updateProfile(name: String, phone: String, is2FAEnabled: Boolean, currencyPreference: String): User
    createDeposit(method: String!, amount: Float!, currency: String, transactionHash: String, receiptImage: String): DepositTransaction
    createInvestment(planId: String, planName: String, amount: Float!, roi: String): UserInvestment
    settleInvestment(id: ID!): SettlementResult
    createWithdrawal(amount: Float!, method: String, destinationAddress: String!, twoFactorCode: String): WithdrawalResult
    markNotificationRead(id: ID!): Boolean
    markAllNotificationsRead: Boolean
    adminUpdateDepositStatus(id: ID!, status: String!): DepositTransaction
    adminUpdateWithdrawalStatus(id: ID!, status: String!, txHash: String): WithdrawalResult
    adminUpdatePlan(id: ID!, roi: String, minAmount: Float, maxAmount: Float, feeRate: Float): InvestmentPlan
    adminAdjustUserBalance(email: String!, action: String!, amount: Float!, reason: String): AdminBalanceAdjustResult
    createSubAdmin(fullName: String, email: String!, password: String!, permissions: [String], role: String): User
  }
`;
