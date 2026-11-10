const ROLES = Object.freeze({ STUDENT: 'student', MENTOR: 'mentor' });

const BOUNTY_STATUS = Object.freeze({
  OPEN: 'open',
  ACCEPTED: 'accepted',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

const ROOM_STATUS = Object.freeze({ ACTIVE: 'active', CLOSED: 'closed' });

const LIMITS = Object.freeze({
  TITLE_MAX: 120,
  DESCRIPTION_MAX: 2000,
  TAGS_MAX: 8,
  REWARD_MIN: 1,
  REWARD_MAX: 1000,
  SESSION_MIN: 5,
  SESSION_MAX: 480,
  ACCEPT_WINDOW_MIN: 1,
  ACCEPT_WINDOW_MAX: 1440,
  MESSAGE_MAX: 2000,
  NOTES_MAX: 20000,
  PASSWORD_MIN: 6,
});

module.exports = { ROLES, BOUNTY_STATUS, ROOM_STATUS, LIMITS };
