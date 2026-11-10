const { createMemoryRepositories } = require('../../src/repositories/memory');
const { createServices } = require('../../src/services');

/** A controllable clock so time-based rules can be tested deterministically. */
function createFakeClock(start = new Date('2026-01-01T10:00:00Z')) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advanceMinutes(min) {
      current = new Date(current.getTime() + min * 60000);
    },
  };
}

/** Notifier test double: records every event instead of pushing to sockets. */
function createRecordingNotifier() {
  const events = [];
  return {
    events,
    toUsers(userIds, event, payload) {
      events.push({ kind: 'users', userIds: [...userIds], event, payload });
    },
    toRole(role, event, payload) {
      events.push({ kind: 'role', role, event, payload });
    },
    toRoom(roomId, event, payload) {
      events.push({ kind: 'room', roomId, event, payload });
    },
    find(event) {
      return events.filter((e) => e.event === event);
    },
    clear() {
      events.length = 0;
    },
  };
}

function createTestContext(overrides = {}) {
  const repos = createMemoryRepositories();
  const clock = overrides.clock || createFakeClock();
  const notifier = overrides.notifier || createRecordingNotifier();
  const config = {
    jwtSecret: 'test-secret',
    jwtExpiresIn: '1h',
    starterTokens: 100,
    bcryptRounds: 4,
    ...overrides.config,
  };
  const services = createServices({ repos, clock, notifier, config });
  return { repos, clock, notifier, config, services };
}

module.exports = { createFakeClock, createRecordingNotifier, createTestContext };
