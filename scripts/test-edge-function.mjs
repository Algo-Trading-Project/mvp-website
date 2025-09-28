#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(filePath) {
  const env = {};
  const text = readFileSync(filePath, 'utf-8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim();
  }
  return env;
}

async function main() {
  const [, , functionName, payloadPath = null, envFile = 'supabase/.env.example'] = process.argv;
  if (!functionName) {
    console.error('Usage: node scripts/test-edge-function.mjs <function-name> [payload.json] [env-file]');
    process.exit(1);
  }

  const env = loadEnv(resolve(envFile));
  const projectUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_KEY;

  if (!projectUrl || !anonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY/SUPABASE_ANON_KEY in env file.');
    process.exit(1);
  }

  const payload = payloadPath ? JSON.parse(readFileSync(resolve(payloadPath), 'utf-8')) : {};

  const response = await fetch(`${projectUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
  try {
    console.log('Body:', JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log('Body:', text);
  }
}

main().catch((err) => {
  console.error('Test invocation failed:', err);
  process.exit(1);
});
