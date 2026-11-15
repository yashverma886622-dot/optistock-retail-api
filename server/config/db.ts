import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.ts';

export type DbConnectionStatus = 'connected' | 'connecting' | 'unconfigured' | 'error' | 'disconnected';

export interface DbHealthState {
  connected: boolean;
  status: DbConnectionStatus;
  message: string;
  host?: string;
  name?: string;
  sanitizedUri?: string;
  usesDefaultTestDb?: boolean;
  lastCheckedAt: string;
}

let lastErrorMessage = '';
let dnsConfigured = false;

/**
 * DNS workaround for Atlas SRV lookups. Some ISPs/routers refuse SRV queries, which makes
 * mongodb+srv:// fail with `querySrv ECONNREFUSED`. Setting MONGODB_DNS_SERVERS routes Node's
 * resolver through public DNS. When the variable is unset, the system resolver is used.
 */
function applyDnsWorkaround(): void {
  if (dnsConfigured || env.MONGODB_DNS_SERVERS.length === 0) return;
  try {
    dns.setServers(env.MONGODB_DNS_SERVERS);
    dnsConfigured = true;
    console.log(`[Database] Using custom DNS servers: ${env.MONGODB_DNS_SERVERS.join(', ')}`);
  } catch (err) {
    console.warn('[Database] Invalid MONGODB_DNS_SERVERS, ignoring:', err instanceof Error ? err.message : err);
  }
}

export function getSanitizedMongoUri(rawUri: string): string {
  const trimmed = rawUri.trim();
  if (!trimmed) return '';
  // Mask credentials while preserving scheme, host, and database path
  const masked = trimmed.replace(/\/\/([^/@]+)@/, '//***:***@');
  const withoutQuery = masked.split('?')[0];
  return withoutQuery;
}

export async function connectDatabase(): Promise<DbHealthState> {
  if (!env.MONGODB_URI) {
    lastErrorMessage = 'MONGODB_URI environment variable is not configured.';
    return getDatabaseHealth();
  }

  if (mongoose.connection.readyState === 1) {
    lastErrorMessage = '';
    return getDatabaseHealth();
  }

  applyDnsWorkaround();

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      maxPoolSize: 15,
    });
    lastErrorMessage = '';
    return getDatabaseHealth();
  } catch (err) {
    lastErrorMessage = err instanceof Error ? err.message : 'Failed to connect to MongoDB Atlas.';
    return getDatabaseHealth();
  }
}

export function getDatabaseHealth(): DbHealthState {
  const readyState = mongoose.connection.readyState;
  const sanitizedUri = getSanitizedMongoUri(env.MONGODB_URI);

  if (!env.MONGODB_URI) {
    return {
      connected: false,
      status: 'unconfigured',
      message: 'MONGODB_URI is not set. Add your MongoDB Atlas connection string to environment secrets or .env.',
      lastCheckedAt: new Date().toISOString(),
    };
  }

  if (readyState === 1) {
    const dbName = mongoose.connection.name;
    return {
      connected: true,
      status: 'connected',
      message: 'Connected to MongoDB Atlas.',
      host: mongoose.connection.host,
      name: dbName,
      sanitizedUri,
      usesDefaultTestDb: dbName === 'test',
      lastCheckedAt: new Date().toISOString(),
    };
  }

  if (readyState === 2) {
    return {
      connected: false,
      status: 'connecting',
      message: 'Connecting to MongoDB Atlas...',
      sanitizedUri,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  if (lastErrorMessage) {
    return {
      connected: false,
      status: 'error',
      message: lastErrorMessage,
      sanitizedUri,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  return {
    connected: false,
    status: 'disconnected',
    message: 'Disconnected from MongoDB Atlas.',
    sanitizedUri,
    lastCheckedAt: new Date().toISOString(),
  };
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
