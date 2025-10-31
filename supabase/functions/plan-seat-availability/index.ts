import { json, methodNotAllowed } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";
import { tierFromPlanSlug, normalizePlanSlug } from "../_shared/subscription.ts";

// Returns seat usage for Pro‑Developer and API tiers.
// Uses service role; no client auth required.
// In-memory cache to avoid expensive fallbacks on hot paths (best-effort)
let CACHE: { proDev: number; api: number; updatedAt: string; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return methodNotAllowed();
  }
  try {
    // Optional: enable verbose debug mode
    let payload: Record<string, unknown> = {};
    try { payload = await req.json(); } catch (_) {}
    const debug = Boolean((payload as any)?.debug);

    const supabase = getServiceSupabaseClient();
    // Seat-holding statuses (match app's current logic)
    const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

    // Serve cached result if fresh
    const now = Date.now();
    if (CACHE && CACHE.expiresAt > now) {
      const MAX = { pro_dev: 70, api: 30 } as const;
      const response = {
        pro_dev: { used: CACHE.proDev, max: MAX.pro_dev, left: Math.max(0, MAX.pro_dev - CACHE.proDev) },
        api: { used: CACHE.api, max: MAX.api, left: Math.max(0, MAX.api - CACHE.api) },
        updated_at: CACHE.updatedAt,
        ...(debug ? { debug: { source: 'cache', active_statuses: ACTIVE_STATUSES } } : {}),
      } as Record<string, unknown>;
      try {
        console.log('[plan-seat-availability] result', JSON.stringify({ source: 'cache', pro_dev_used: CACHE.proDev, api_used: CACHE.api, updated_at: CACHE.updatedAt }));
      } catch (_) {}
      return json(response);
    }

    // Fast path: count from the mirrored users table (if available)
    const countFromUsersTable = async () => {
      try {
        const base = supabase.from('users');
        const proQuery = base
          .select('*', { count: 'exact', head: true })
          // NOTE: users.subscription_tier stores normalized tiers (pro_dev, api).
          // Also count plan-style keys in case of migrations.
          .in('subscription_tier', ['pro_dev', 'signals_pro_dev'])
          .in('subscription_status', ACTIVE_STATUSES);
        const apiQuery = base
          .select('*', { count: 'exact', head: true })
          .in('subscription_tier', ['api', 'signals_api'])
          .in('subscription_status', ACTIVE_STATUSES);
        const [{ count: proDevCount, error: e1 }, { count: apiCount, error: e2 }] = await Promise.all([
          proQuery,
          apiQuery,
        ]);
        if (e1 || e2) throw e1 || e2;
        if (typeof proDevCount === 'number' && typeof apiCount === 'number') {
          return { proDev: proDevCount, api: apiCount };
        }
      } catch (_ignored) {
        // Fall back to admin auth scan
      }
      return null;
    };

    const countFromAuthUsers = async () => {
      let page = 1;
      const perPage = 1000;
      let proDev = 0;
      let api = 0;
      while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const users = data?.users ?? [];
        for (const u of users as any[]) {
          const meta = (u.user_metadata || u.raw_user_meta_data || {}) as Record<string, unknown>;
          const status = String(meta.subscription_status ?? '').toLowerCase();
          if (!ACTIVE_STATUSES.includes(status)) continue;

          // Prefer explicit tier; otherwise infer from plan_slug
          const explicitTierRaw = String(
            (meta.subscription_tier ?? meta.subscriptionLevel ?? meta.subscription_level ?? meta.plan_tier ?? '') || ''
          ).toLowerCase();
          const explicitTier = explicitTierRaw.replace(/[-_\s]+/g, '_');
          const slug = String(normalizePlanSlug(String(meta.plan_slug ?? '')) || '').toLowerCase();

          const isProDev = explicitTier === 'signals_pro_dev' || explicitTier === 'pro_dev' || slug === 'signals_pro_dev';
          const isApi = explicitTier === 'signals_api' || explicitTier === 'api' || slug === 'signals_api';

          if (isProDev) proDev++;
          else if (isApi) api++;
        }
        if (users.length < perPage) break;
        page += 1;
      }
      return { proDev, api };
    };

    let counts = await countFromUsersTable();
    let source: 'users_table' | 'auth_scan' | 'merged' = 'users_table';
    // If users table is empty or RLS-restricted, fall back automatically
    if (!counts || counts.proDev === 0 || counts.api === 0) {
      const fallback = await countFromAuthUsers();
      if (!counts) {
        counts = fallback;
        source = 'auth_scan';
      } else {
        counts = {
          proDev: Math.max(counts.proDev, fallback.proDev),
          api: Math.max(counts.api, fallback.api),
        };
        source = 'merged';
      }
    }
    const { proDev, api } = counts;
    const MAX = { pro_dev: 70, api: 30 } as const;
    const response = {
      pro_dev: { used: proDev, max: MAX.pro_dev, left: Math.max(0, MAX.pro_dev - proDev) },
      api: { used: api, max: MAX.api, left: Math.max(0, MAX.api - api) },
      updated_at: new Date().toISOString(),
      ...(debug
        ? {
            debug: {
              source,
              active_statuses: ACTIVE_STATUSES,
            },
          }
        : {}),
    } as Record<string, unknown>;

    // Always log a concise structured line so you can verify values in logs
    try {
      console.log('[plan-seat-availability] result', JSON.stringify({ source, pro_dev_used: proDev, api_used: api, updated_at: (response as any).updated_at }));
    } catch (_) {}

    // Update cache
    CACHE = {
      proDev,
      api,
      updatedAt: (response as any).updated_at as string,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return json(response);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
