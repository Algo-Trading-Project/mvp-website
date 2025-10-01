import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

let client: SupabaseClient | null = null;

export function getServiceSupabaseClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // Prefer service role if provided; otherwise fall back to anon for read‑only access
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_KEY') ??
    null;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? null;

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    throw new Error('Missing Supabase credentials (SUPABASE_URL and a key) for database access');
  }

  client = createClient(supabaseUrl, serviceRoleKey ?? anonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}
