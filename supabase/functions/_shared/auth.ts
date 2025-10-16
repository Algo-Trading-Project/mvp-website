import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl) {
  console.warn('SUPABASE_URL not set; auth helpers will fail');
}
if (!serviceRoleKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not set; auth helpers will fail');
}

const supabaseClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : null;

export async function getUserFromRequest(req: Request) {
  if (!supabaseClient) return null;
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error) {
    console.warn('Auth token validation failed', error.message);
    return null;
  }
  return data.user ?? null;
}
