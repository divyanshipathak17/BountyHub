const http = require('http');
const express = require('express');
const cors = require('cors');
const { createServices } = require('./services');
const { createApiRouter } = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { createSocketNotifier } = require('./realtime/notifier');
const { attachRealtime } = require('./realtime/socket');

const systemClock = { now: () => new Date() };

/**
 * Wire the whole application around a set of repositories.
 * Used by src/server.js (Mongo repos) and by the integration tests (memory repos).
 */
function buildServer({ repos, config, clock = systemClock }) {
  const notifier = createSocketNotifier();
  const services = createServices({ repos, clock, notifier, config });

  const app = express();
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createApiRouter(services));
  app.use(notFoundHandler);
  app.use(errorHandler);

  const httpServer = http.createServer(app);
  const io = attachRealtime(httpServer, { services, notifier, corsOrigin: config.corsOrigin });

  let sweepTimer = null;
  return {
    app,
    httpServer,
    io,
    services,
    startExpirySweep(intervalMs) {
      sweepTimer = setInterval(() => {
        services.bounties.expireStale().catch((e) => console.error('[expiry-sweep]', e)); // eslint-disable-line no-console
      }, intervalMs);
      sweepTimer.unref();
    },
    async close() {
      if (sweepTimer) clearInterval(sweepTimer);
      await new Promise((resolve) => io.close(() => resolve()));
      if (httpServer.listening) await new Promise((resolve) => httpServer.close(() => resolve()));
    },
  };
}

module.exports = { buildServer };
