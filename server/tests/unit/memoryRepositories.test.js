const { runRepositoryContract } = require('../contract/repositories.contract');
const { createMemoryRepositories } = require('../../src/repositories/memory');

let repos;
runRepositoryContract('in-memory', {
  setup: async () => {
    repos = createMemoryRepositories();
    return repos;
  },
  reset: async () => repos.reset(),
});
