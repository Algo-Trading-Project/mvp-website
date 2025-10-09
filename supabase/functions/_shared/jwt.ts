import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SignJWT } from "https://esm.sh/jose@5.4.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "";

if (!SUPABASE_URL) {
  console.warn("SUPABASE_URL is not set; auth helpers will fail");
}
if (!SUPABASE_ANON_KEY) {
  console.warn("SUPABASE_ANON_KEY is not set; auth helpers will fail");
}
if (!SUPABASE_JWT_SECRET) {
  console.warn("SUPABASE_JWT_SECRET not set; RLS impersonation will fail");
}

export const createAuthedClient = async (userId: string, extraClaims: Record<string, unknown> = {}) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_JWT_SECRET) {
    throw new Error("Supabase credentials are not configured for authenticated client creation");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    role: "authenticated",
    iat: now,
    exp: now + 60 * 10,
    ...extraClaims,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(SUPABASE_JWT_SECRET));

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  return { client, token };
};
