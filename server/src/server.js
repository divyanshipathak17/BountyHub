/* eslint-disable no-console */
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { buildServer } = require('./bootstrap');
const { createMongoRepositories } = require('./repositories/mongo');
const { createMemoryRepositories } = require('./repositories/memory');

async function main() {
  const config = loadConfig();
  let repos;

  if (config.storage === 'memory') {
    // Quick demo mode: no database, data is lost on restart.
    repos = createMemoryRepositories();
    console.log('[db] STORAGE=memory, using in-memory repositories (data is not persisted)');
  } else {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log(`[db] connected to ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);
      repos = createMongoRepositories();
      await repos.syncIndexes();
    } catch (err) {
      console.error(`\n[db] Could not connect to MongoDB at ${config.mongoUri}`);
      console.error(`[db] Reason: ${err.message}`);
      console.error('\nTo fix this:');
      console.error('  1. Start MongoDB with Docker: docker compose up -d mongo');
      console.error('  2. OR run without MongoDB by setting STORAGE=memory in server/.env\n');
      process.exit(1);
    }
  }

  const server = buildServer({ repos, config });

  if (config.storage === 'memory') {
    const { seedUsers } = require('./scripts/seed');
    await seedUsers(server.services, repos);
    console.log('[db] Seeded demo users for in-memory session (password: password123)');
  }

  server.startExpirySweep(config.expirySweepMs);
  server.httpServer.listen(config.port, () => {
    console.log(`[api] BountyHub listening on http://localhost:${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    await server.close();
    if (mongoose.connection.readyState) await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
