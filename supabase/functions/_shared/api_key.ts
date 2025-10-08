import { getServiceSupabaseClient } from './supabase.ts';
import { json } from './http.ts';

export interface ApiUser {
  user_id: string;
  email: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  plan_started_at: string | null;
}

const encoder = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type ApiAuthResult =
  | { ok: true; user: ApiUser; keyHash: string }
  | { ok: false; response: Response };

export async function authenticateApiRequest(req: Request): Promise<ApiAuthResult> {
  const headerKey = req.headers.get('x-api-key') ?? req.headers.get('X-Api-Key');
  const queryKey = new URL(req.url).searchParams.get('api_key');
  const rawKey = (headerKey ?? queryKey ?? '').trim();

  if (!rawKey) {
    return {
      ok: false,
      response: json({ error: 'Missing API key (use x-api-key header)' }, { status: 401 }),
    };
  }

  try {
    const keyHash = await sha256Hex(rawKey);
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select(
        'user_id, email, subscription_tier, subscription_status, current_period_end, plan_started_at',
      )
      .eq('api_key_hash', keyHash)
      .maybeSingle();

    if (error) {
      console.error('Failed to validate API key', error);
      return { ok: false, response: json({ error: 'Internal authorization error' }, { status: 500 }) };
    }

    if (!data) {
      return {
        ok: false,
        response: json(
          { error: 'Invalid API key', api_key_hash: keyHash, match: false },
          { status: 403 },
        ),
      };
    }

    return { ok: true, user: data as ApiUser, keyHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('API key authentication failed', message);
    return {
      ok: false,
      response: json({ error: 'Failed to authenticate request' }, { status: 401 }),
    };
  }
}
