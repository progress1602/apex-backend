import { ApolloServer } from '@apollo/server';
import { Express, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { UserModel, IUserDocument } from '../models';
import { AuthTokenPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'apexbridge_super_secret_jwt_key_2026_x89f';

export async function setupApolloServer(app: Express) {
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
  });

  await apolloServer.start();

  // Embedded Apollo Sandbox Playground HTML template
  const renderApolloSandboxHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ApexBridge Apollo Sandbox Playground</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      margin: 0;
      overflow: hidden;
      background: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #sandbox {
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="sandbox"></div>
  <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
  <script>
    new window.EmbeddedSandbox({
      target: '#sandbox',
      initialEndpoint: window.location.origin + '/graphql',
      includeCookies: true,
      initialState: {
        document: \`# ========================================================
# 🚀 ApexBridge Apollo Sandbox Playground
# ========================================================
# 1. Sign up or Login with your email & password:
mutation LoginUser {
  login(email: "admin@apexbridge.com", password: "AdminPassword123!") {
    success
    token
    user {
      id
      name
      email
      role
      balance
    }
  }
}

# 2. Query your own dashboard data (pass your token in Headers: { "Authorization": "Bearer <YOUR_TOKEN>" }):
query GetMyDashboard {
  me {
    id
    name
    email
    role
    tier
    balance
  }
  walletSummary {
    totalPortfolio
    availableBalance
    activeInvestments
    totalEarnings
    currency
  }
  marketTickers {
    symbol
    price
    change24h
  }
  investmentPlans {
    id
    name
    roi
    minAmount
    maxAmount
  }
  userInvestments {
    id
    planName
    amount
    roi
    status
  }
}
\`
      }
    });
  </script>
</body>
</html>`;

  // Serve Embedded Apollo Sandbox UI on GET /apollo and GET /graphql (for browser navigations)
  app.get(['/apollo', '/graphql'], (req: Request, res: Response, next: NextFunction) => {
    const accept = req.headers.accept || '';
    if (accept.includes('text/html') || req.path === '/apollo' || !req.query.query) {
      res.setHeader('Content-Type', 'text/html');
      res.send(renderApolloSandboxHTML());
      return;
    }
    next();
  });

  // Handle GraphQL POST requests
  app.post('/graphql', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || req.headers['authorization'] || '';
    let user: IUserDocument | null = null;

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
        user = await UserModel.findOne({ userId: decoded.userId });
      } catch {
        // Token invalid, user remains null
      }
    }

    const { query, variables, operationName } = req.body || {};

    if (!query) {
      res.status(400).json({ errors: [{ message: 'Must provide query string.' }] });
      return;
    }

    try {
      const response = await apolloServer.executeOperation(
        {
          query,
          variables,
          operationName,
        },
        {
          contextValue: { user: user || undefined },
        }
      );

      if (response.body.kind === 'single') {
        res.status(200).json(response.body.singleResult);
      } else {
        res.status(200).json(response.body);
      }
    } catch (err: any) {
      res.status(500).json({ errors: [{ message: err.message || 'Internal GraphQL execution error' }] });
    }
  });

  return apolloServer;
}
