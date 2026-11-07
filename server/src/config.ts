import path from 'node:path';

export const serverRoot = path.resolve(import.meta.dirname, '..');

try {
  process.loadEnvFile(path.join(serverRoot, '.env'));
} catch {
  // .env is optional
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function corsOrigins(raw: string | undefined): true | string[] {
  if (!raw || raw === '*') return true;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

/** local = files on disk, db = PostgreSQL rows (no persistent disk needed), r2 = Cloudflare R2. */
function storageDriver(raw: string | undefined): 'local' | 'db' | 'r2' {
  if (raw === 'r2' || raw === 'db') return raw;
  return 'local';
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

function r2Config(): R2Config | null {
  const accountId = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET');
  const publicUrl = env('R2_PUBLIC_URL');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl: publicUrl.replace(/\/$/, '') };
}

export const config = {
  port: Number(env('PORT') ?? 4000),
  /** Unset = all interfaces, IPv4 and IPv6 (so both localhost and LAN phones work). */
  host: env('HOST'),
  databaseUrl: env('DATABASE_URL') ?? null,
  corsOrigins: corsOrigins(env('CORS_ORIGINS')),
  storageDriver: storageDriver(env('STORAGE_DRIVER')),
  storageDir: path.resolve(serverRoot, env('STORAGE_DIR') ?? 'data/uploads'),
  uploadSigningSecret: env('UPLOAD_SIGNING_SECRET') ?? 'dev-only-secret',
  r2: r2Config(),
  contentDir: path.join(serverRoot, 'content'),
  migrationsDir: path.join(serverRoot, 'drizzle'),
  /** How often expired custom images and stale rooms are cleaned up. Hourly lets a serverless DB sleep longer. */
  sweepIntervalMs: Number(env('SWEEP_INTERVAL_MS') ?? 10 * 60 * 1000),
  /**
   * When set, the server requests this URL every 10 minutes. Render's free plan stops a service after
   * 15 minutes without inbound traffic; pointing this at the service's own public /health keeps it awake.
   */
  keepAliveUrl: env('KEEPALIVE_URL') ?? null,
};

export type Config = typeof config;
