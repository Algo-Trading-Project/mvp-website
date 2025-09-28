import { Pool } from 'npm:pg';

let pool: Pool | null = null;

const DEFAULT_MAX_CONNECTIONS = 4;

function createPool() {
  const connectionString =
    Deno.env.get('SUPABASE_DB_URL') ??
    Deno.env.get('DATABASE_URL') ??
    Deno.env.get('SUPABASE_POSTGRES_URL');

  if (!connectionString) {
    throw new Error('Missing SUPABASE_DB_URL (or DATABASE_URL) secret for Postgres connection');
  }

  return new Pool({
    connectionString,
    max: Number(Deno.env.get('SUPABASE_DB_POOL_SIZE') ?? DEFAULT_MAX_CONNECTIONS),
    ssl: { rejectUnauthorized: false }
  });
}

export function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}
