import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = (process.env.NODE_ENV || 'development').trim();
const port = Number(process.env.PORT || 3000);
const mongoUri = (process.env.MONGODB_URI || '').trim();
const configuredJwtSecret = (process.env.JWT_SECRET || '').trim();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid PORT. Set PORT to an integer between 1 and 65535.');
}

if (nodeEnv === 'production' && configuredJwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}

if (mongoUri && !/^mongodb(\+srv)?:\/\//i.test(mongoUri)) {
  throw new Error('Invalid MONGODB_URI. It must start with mongodb:// or mongodb+srv://.');
}

export const env = {
  PORT: port,
  NODE_ENV: nodeEnv,
  MONGODB_URI: mongoUri,
  // A development-only fallback keeps local tests/demo startup convenient.
  // Production startup is blocked above unless a strong secret is provided.
  JWT_SECRET: configuredJwtSecret || 'optistock-dev-only-secret-not-for-production',
  JWT_EXPIRES_IN: (process.env.JWT_EXPIRES_IN || '7d').trim(),
  APP_URL: (process.env.APP_URL || 'http://localhost:3000').trim(),
  // Optional comma-separated DNS servers (e.g. "8.8.8.8,1.1.1.1") for networks where Atlas
  // mongodb+srv lookups fail with `querySrv ECONNREFUSED`.
  MONGODB_DNS_SERVERS: (process.env.MONGODB_DNS_SERVERS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
};
