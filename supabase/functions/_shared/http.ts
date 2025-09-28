import { corsHeaders } from './middleware.ts';

export async function readJson<T>(req: Request): Promise<T> {
  return await req.json() as T;
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8');
  }
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function methodNotAllowed(): Response {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export function internalError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message, error);
  return json({ error: message }, { status: 500 });
}
