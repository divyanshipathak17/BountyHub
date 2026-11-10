/* eslint-disable no-console */
/**
 * Seeds demo accounts (password for all: password123).
 *   npm run seed
 */
const mongoose = require('mongoose');
const { loadConfig } = require('../config');
const { createMongoRepositories } = require('../repositories/mongo');
const { createServices } = require('../services');

const DEMO = [
  { name: 'Asha (Student)', email: 'student@bountyhub.dev', role: 'student' },
  { name: 'Ravi (Mentor)', email: 'mentor@bountyhub.dev', role: 'mentor', skills: ['docker', 'node', 'mongodb'] },
  { name: 'Meera (Mentor)', email: 'mentor2@bountyhub.dev', role: 'mentor', skills: ['docker', 'react'] },
  { name: 'Kabir (Mentor)', email: 'python@bountyhub.dev', role: 'mentor', skills: ['python', 'django'] },
];

async function seedUsers(services, repos) {
  for (const u of DEMO) {
    if (await repos.users.findByEmail(u.email)) {
      console.log(`exists   ${u.email}`);
      continue;
    }
    await services.auth.register({ ...u, password: 'password123' });
    console.log(`created  ${u.email}  (${u.role})`);
  }
}

async function main() {
  const config = loadConfig();
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    console.error(`\n[seed] Could not connect to MongoDB at ${config.mongoUri}`);
    console.error(`[seed] Reason: ${err.message}`);
    console.error('\nMake sure MongoDB is running:\n  docker compose up -d mongo\n');
    process.exit(1);
  }

  const repos = createMongoRepositories();
  await repos.syncIndexes();
  const noop = { toUsers() {}, toRole() {}, toRoom() {} };
  const services = createServices({ repos, clock: { now: () => new Date() }, notifier: noop, config });

  await seedUsers(services, repos);
  await mongoose.disconnect();
  console.log('\nAll demo accounts use password: password123');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { DEMO, seedUsers };
