const { unauthorized } = require('../domain/errors');

/** Express middleware: requires `Authorization: Bearer <jwt>` and sets req.user = { id, role }. */
function requireAuth(authService) {
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(unauthorized('Missing bearer token'));
    try {
      req.user = authService.verifyToken(token);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireAuth };
