import dotenv from 'dotenv';
dotenv.config();

import { initializeApp } from './app';

const PORT = process.env.PORT || 5000;

async function startServer() {
  const app = await initializeApp();

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 ApexBridge REST & GraphQL API is running!`);
    console.log(`🔗 Local Base URL:         http://localhost:${PORT}`);
    console.log(`🚀 Apollo Sandbox:         http://localhost:${PORT}/apollo`);
    console.log(`🎮 Swagger Playground:     http://localhost:${PORT}/playground`);
    console.log(`📖 Scalar API Docs:        http://localhost:${PORT}/scalar`);
    console.log(`📋 OpenAPI Schema:         http://localhost:${PORT}/openapi.json`);
    console.log(`=======================================================`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
