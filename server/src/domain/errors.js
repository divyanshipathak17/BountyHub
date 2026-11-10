/** Application error carrying an HTTP status; thrown by services, mapped by the error middleware. */
class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

const badRequest = (msg) => new AppError(400, msg, 'BAD_REQUEST');
const unauthorized = (msg = 'Unauthorized') => new AppError(401, msg, 'UNAUTHORIZED');
const insufficientFunds = (msg = 'Not enough tokens') => new AppError(402, msg, 'INSUFFICIENT_TOKENS');
const forbidden = (msg = 'Forbidden') => new AppError(403, msg, 'FORBIDDEN');
const notFound = (msg = 'Not found') => new AppError(404, msg, 'NOT_FOUND');
const conflict = (msg) => new AppError(409, msg, 'CONFLICT');
const locked = (msg = 'Room is locked') => new AppError(423, msg, 'LOCKED');

/** Raised by repositories when a unique constraint is violated. */
class DuplicateKeyError extends Error {
  constructor(field) {
    super(`Duplicate ${field}`);
    this.code = 'DUPLICATE';
    this.field = field;
  }
}

module.exports = { AppError, DuplicateKeyError, badRequest, unauthorized, insufficientFunds, forbidden, notFound, conflict, locked };
