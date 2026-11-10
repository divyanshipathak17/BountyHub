/**
 * Runs the SAME repository contract against a real MongoDB.
 *
 *   docker compose up -d mongo
 *   MONGO_URI_TEST=mongodb://localhost:27017/bountyhub_test npm run test:mongo
 *
 * Skipped automatically when MONGO_URI_TEST is not set, so `npm test`
 * works on machines without Docker.
 */
const mongoose = require('mongoose');
const { runRepositoryContract } = require('../contract/repositories.contract');
const { createMongoRepositories } = require('../../src/repositories/mongo');

const uri = process.env.MONGO_URI_TEST;

if (!uri) {
  describe('Repository contract: mongodb', () => {
    test.skip('set MONGO_URI_TEST to run against a real MongoDB', () => {});
  });
} else {
  let repos;
  runRepositoryContract('mongodb', {
    setup: async () => {
      await mongoose.connect(uri);
      repos = createMongoRepositories();
      await repos.syncIndexes();
      return repos;
    },
    reset: async () => repos.reset(),
    teardown: async () => {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    },
  });
}
