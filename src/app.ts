import express, { Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import { apiReference } from '@scalar/express-api-reference';
import openapiSpec from './swagger/openapi.json';

// Route imports
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import walletRoutes from './routes/wallet.routes';
import depositRoutes from './routes/deposit.routes';
import investmentRoutes from './routes/investment.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import transactionRoutes from './routes/transaction.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import { setupApolloServer } from './graphql/apollo';
import { connectDatabase } from './config/database';

export const app = express();

// Robust CORS Middleware: Allows any browser, frontend, or playground (Apollo, Postman, Swagger)
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, apollo-require-preflight, x-apollo-operation-name, *'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve raw OpenAPI JSON for external tooling / playgrounds
app.get(['/openapi.json', '/api/v1/openapi.json'], (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(openapiSpec);
});

// Swagger UI Playground (at /playground and /docs)
app.use(
  '/playground',
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'ApexBridge API Playground',
  })
);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Scalar API Reference (at /scalar)
app.use(
  '/scalar',
  apiReference({
    spec: {
      content: openapiSpec,
    },
    theme: 'purple',
  })
);

// Landing / Health check endpoint
app.get('/', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>ApexBridge REST & GraphQL API</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f3f4f6; margin: 0; padding: 40px 20px; display: flex; justify-content: center; }
        .container { max-width: 780px; width: 100%; background: #131b2e; border: 1px solid #1f293d; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
        h1 { color: #60a5fa; margin-top: 0; font-size: 28px; }
        p { color: #9ca3af; line-height: 1.6; }
        .badge { display: inline-block; padding: 4px 10px; background: #10b981; color: #fff; border-radius: 9999px; font-size: 12px; font-weight: bold; margin-bottom: 16px; }
        .btn-group { display: flex; gap: 12px; margin: 24px 0; flex-wrap: wrap; }
        .btn { display: inline-block; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; transition: all 0.2s; }
        .btn-apollo { background: #3f20ba; color: #fff; border: 1px solid #6366f1; }
        .btn-apollo:hover { background: #4f46e5; }
        .btn-primary { background: #2563eb; color: #fff; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-secondary { background: #374151; color: #e5e7eb; }
        .btn-secondary:hover { background: #4b5563; }
        .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin-top: 20px; }
        code { background: #1e293b; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
        ul { color: #cbd5e1; padding-left: 20px; }
        li { margin-bottom: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="badge">● API LIVE & OPERATIONAL</div>
        <h1>ApexBridge API & Playgrounds</h1>
        <p>High-yield crypto and investment portal backend with comprehensive REST & GraphQL endpoints, persistent state, JWT authentication, and interactive playgrounds.</p>
        
        <div class="btn-group">
          <a href="/apollo" class="btn btn-apollo">🚀 Open Apollo Sandbox Playground</a>
          <a href="/playground" class="btn btn-primary">🎮 Open Swagger Playground</a>
          <a href="/scalar" class="btn btn-secondary">📚 Open Scalar Docs</a>
          <a href="/openapi.json" class="btn btn-secondary" target="_blank">⚙️ OpenAPI Spec (JSON)</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Mount API v1 Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1', walletRoutes);
app.use('/api/v1/deposits', depositRoutes);
app.use('/api/v1/investments', investmentRoutes);
app.use('/api/v1/withdrawals', withdrawalRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/admin', adminRoutes);

// Setup database & Apollo Server on app
export async function initializeApp() {
  await connectDatabase();
  await setupApolloServer(app);
  return app;
}

export default app;
