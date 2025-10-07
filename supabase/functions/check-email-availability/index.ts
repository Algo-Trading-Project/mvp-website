import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { badRequest, internalError, json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { email = '' } = await req.json().catch(() => ({}));
    if (typeof email !== 'string') {
      return badRequest('email must be a string');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return badRequest('email is required');
    }
    if (!emailRegex.test(normalizedEmail)) {
      return badRequest('email must be valid');
    }

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase.auth.admin.getUserByEmail(normalizedEmail);
    if (error && !/user not found/i.test(error.message ?? '')) {
      throw error;
    }

    const exists = Boolean(data?.user);
    return json({ exists });
  } catch (error) {
    return internalError(error);
  }
});
