const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { badRequest, conflict, unauthorized } = require('../domain/errors');
const { ROLES, LIMITS } = require('../domain/constants');
const { normalizeTags } = require('../domain/skills');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strip secrets before a user leaves the service layer. */
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

function createAuthService({ repos, config }) {
  const sign = (user) => jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

  return {
    async register(input = {}) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const { password, role } = input;
      const skills = normalizeTags(input.skills);

      if (!name) throw badRequest('Name is required');
      if (!EMAIL_RE.test(email)) throw badRequest('A valid email is required');
      if (typeof password !== 'string' || password.length < LIMITS.PASSWORD_MIN) {
        throw badRequest(`Password must be at least ${LIMITS.PASSWORD_MIN} characters`);
      }
      if (!Object.values(ROLES).includes(role)) throw badRequest('Role must be student or mentor');
      if (role === ROLES.MENTOR && skills.length === 0) throw badRequest('Mentors must list at least one skill');

      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      let user;
      try {
        user = await repos.users.create({
          name,
          email,
          passwordHash,
          role,
          skills,
          tokens: role === ROLES.STUDENT ? config.starterTokens : 0,
        });
      } catch (err) {
        if (err.code === 'DUPLICATE') throw conflict('An account with this email already exists');
        throw err;
      }
      return { user: publicUser(user), token: sign(user) };
    },

    async login({ email, password } = {}) {
      const user = email ? await repos.users.findByEmail(email) : null;
      const ok = user && typeof password === 'string' && (await bcrypt.compare(password, user.passwordHash));
      if (!ok) throw unauthorized('Invalid email or password');
      return { user: publicUser(user), token: sign(user) };
    },

    verifyToken(token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret);
        return { id: payload.sub, role: payload.role };
      } catch {
        throw unauthorized('Invalid or expired token');
      }
    },

    async me(userId) {
      const user = await repos.users.findById(userId);
      if (!user) throw unauthorized('User no longer exists');
      return publicUser(user);
    },
  };
}

module.exports = { createAuthService, publicUser };
