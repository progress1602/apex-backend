# 🚀 ApexBridge REST API Backend

A production-ready high-performance REST API backend for the **ApexBridge** crypto and investment platform. Built with **Node.js, Express, TypeScript, and JWT Authentication**, pre-configured with interactive playgrounds (Swagger UI & Scalar), open CORS for all external web clients and Apollo Studio / Postman, and 1-click cloud hosting configurations.

---

## ⚡ Quick Start (Local)

### 1. Install & Run
```bash
# Navigate to the backend directory
cd apexbridge-backend

# Install dependencies (already installed)
npm install

# Start development server
npm run dev

# Or build & start production server
npm run build
npm start
```

### 2. Access the Interactive Playgrounds
Once started, open in your browser:
* 🎮 **Interactive Swagger Playground**: [http://localhost:5000/playground](http://localhost:5000/playground)
* 📚 **Modern Scalar API Reference**: [http://localhost:5000/scalar](http://localhost:5000/scalar)
* 📋 **Raw OpenAPI 3.0 Spec**: [http://localhost:5000/openapi.json](http://localhost:5000/openapi.json)

---

## 🔑 Pre-seeded Demo Credentials

You can test immediately with Alexander Vance's preloaded account:
* **Email:** `alexander@apexbridge.com`
* **Password:** `SecurePassword123!`
* **Preloaded Balance:** `$48,250.00 USD`
* **KYC Tier:** `Tier 2 - Verified`

---

## 🌐 1-Click Free Cloud Hosting (How to Host)

Since you need it hosted without managing complex cloud infrastructure yourself, this repository contains pre-configured blueprints for free, instant cloud providers:

### Option A: 1-Click Render.com (Recommended Free & Fast)
1. Push this folder to a GitHub repository (e.g. `github.com/your-username/apexbridge-backend`).
2. Go to [Render.com](https://render.com) and click **New + > Web Service**.
3. Select your GitHub repository.
4. Render will automatically detect `render.yaml` and configure:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. Click **Create Web Service**. Within ~60 seconds, Render gives you a live public HTTPS URL like:
   `https://apexbridge-backend.onrender.com`

### Option B: Railway.app
1. Go to [Railway.app](https://railway.app) and click **New Project > Deploy from GitHub Repo**.
2. Select this repository. Railway automatically builds using the `Dockerfile` or Node buildpack.
3. Generate a domain under **Settings > Generate Domain** for an instant live URL.

### Option C: Vercel Serverless
1. Install Vercel CLI: `npm i -g vercel` or import the GitHub repo on [Vercel.com](https://vercel.com).
2. The included `vercel.json` will deploy it as high-speed serverless endpoints globally.

---

## 🧪 Running Automated Integration Tests

Run the full end-to-end test suite testing all 18 endpoints:
```bash
npm test
```

---

## 📑 Complete REST API Endpoints Reference

### 1. Authentication & Sessions
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/auth/signup` | Register new investor account | No |
| `POST` | `/api/v1/auth/login` | Authenticate credentials & return JWT | No |
| `GET` | `/api/v1/auth/me` | Get current session & profile | **Yes (Bearer)** |

### 2. User Profile & Settings
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/user/profile` | Get KYC tier, 2FA status, preferences | **Yes (Bearer)** |
| `PATCH` | `/api/v1/user/profile` | Update profile settings | **Yes (Bearer)** |

### 3. Dashboard, Wallet & Market Metrics
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/wallet/summary` | Fetch portfolio, balances, 24h growth | **Yes (Bearer)** |
| `GET` | `/api/v1/analytics/chart` | Chart data points (`1D`, `1W`, `1M`, `1Y`, `ALL`) | No |
| `GET` | `/api/v1/market/tickers` | Real-time BTC, ETH, SOL tickers | No |

### 4. Deposits
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/deposits/methods` | List crypto deposit addresses & networks | No |
| `POST` | `/api/v1/deposits` | Submit deposit transaction hash | **Yes (Bearer)** |

### 5. Investments & Yield Matrix
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/investments/plans` | List active investment plans & yield | No |
| `GET` | `/api/v1/investments` | Get user active/matured investments | **Yes (Bearer)** |
| `POST` | `/api/v1/investments` | Allocate new investment position | **Yes (Bearer)** |
| `POST` | `/api/v1/investments/:id/settle` | Settle completed investment to balance | **Yes (Bearer)** |

### 6. Withdrawals
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/withdrawals` | Request external crypto withdrawal | **Yes (Bearer)** |

### 7. Transactions Ledger & History
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/transactions` | Paginated & filterable transactions | **Yes (Bearer)** |

### 8. Notifications & Alerts
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | List user alerts & announcements | **Yes (Bearer)** |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark specific notification as read | **Yes (Bearer)** |
| `POST` | `/api/v1/notifications/mark-all-read` | Mark all notifications as read | **Yes (Bearer)** |

### 9. Administrative Operations
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `PATCH` | `/api/v1/admin/deposits/:id/status` | Approve or reject deposit | No / Admin |
| `PATCH` | `/api/v1/admin/withdrawals/:id/status`| Process or reject withdrawal | No / Admin |
| `PUT` | `/api/v1/admin/plans/:id` | Update investment plan parameters | No / Admin |
