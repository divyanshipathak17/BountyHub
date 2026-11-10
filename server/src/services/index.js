const { createAuthService } = require('./authService');
const { createBountyService } = require('./bountyService');
const { createRoomService } = require('./roomService');

/**
 * Composition root for the service layer. Everything is injected
 * (repositories, clock, notifier, config) so services stay pure and testable.
 */
function createServices({ repos, clock, notifier, config }) {
  return {
    auth: createAuthService({ repos, config }),
    bounties: createBountyService({ repos, clock, notifier, config }),
    rooms: createRoomService({ repos, clock, notifier, config }),
  };
}

module.exports = { createServices };
