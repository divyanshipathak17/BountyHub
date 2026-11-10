require('dotenv').config();

const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

function loadConfig(env = process.env) {
  const config = {
    port: int(env.PORT, 5000),
    mongoUri: env.MONGO_URI || 'mongodb://localhost:27017/bountyhub',
    jwtSecret: env.JWT_SECRET || 'dev-only-change-me',
    jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
    corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',
    starterTokens: int(env.STARTER_TOKENS, 100),
    bcryptRounds: int(env.BCRYPT_ROUNDS, 10),
    expirySweepMs: int(env.EXPIRY_SWEEP_MS, 30000),
    nodeEnv: env.NODE_ENV || 'development',
    storage: env.STORAGE === 'memory' ? 'memory' : 'mongo',
  };
  if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-only-change-me') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return config;
}

module.exports = { loadConfig };
