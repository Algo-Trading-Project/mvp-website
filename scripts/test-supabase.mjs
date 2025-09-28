#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(filePath) {
  const env = {};
  const text = readFileSync(filePath, 'utf-8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim();
  }
  return env;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const envFile = process.argv[2] ?? 'supabase/.env.example';
  const env = loadEnv(resolve(envFile));
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or service key in env file');
    process.exit(1);
  }

  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const end = new Date();
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - 30);
  const startDate = formatDate(start);
  const endDate = formatDate(end);

  const tests = [
    {
      name: 'cross_sectional_metrics_1d select',
      run: () => client.from('cross_sectional_metrics_1d').select('date').limit(1)
    },
    {
      name: 'monthly_performance_metrics select',
      run: () => client.from('monthly_performance_metrics').select('year,month').limit(1)
    },
    {
      name: 'rpc_decile_lift',
      run: () => client.rpc('rpc_decile_lift', { horizon: '1d', direction: 'long', start_date: startDate, end_date: endDate })
    },
    {
      name: 'rpc_decile_performance',
      run: () => client.rpc('rpc_decile_performance', { horizon: '1d', direction: 'long', start_date: startDate, end_date: endDate })
    },
    {
      name: 'rpc_symbol_expectancy',
      run: () => client.rpc('rpc_symbol_expectancy', { horizon: '1d', direction: 'long', start_date: startDate, end_date: endDate, min_obs: 5 })
    },
    {
      name: 'rpc_symbol_ic',
      run: () => client.rpc('rpc_symbol_ic', { horizon: '1d', start_date: startDate, end_date: endDate, min_points: 5 })
    },
    {
      name: 'rpc_predictions_coverage',
      run: () => client.rpc('rpc_predictions_coverage', { p_start_date: startDate, p_end_date: endDate })
    },
    {
      name: 'rpc_expectancy_distribution_summary',
      run: () => client.rpc('rpc_expectancy_distribution_summary', { field_name: 'cs_1d_expectancy', start_date: startDate, end_date: endDate })
    }
  ];

  let failures = 0;
  for (const test of tests) {
    try {
      const { data, error } = await test.run();
      if (error) {
        failures++;
        console.error(`✖ ${test.name}:`, error.message);
      } else {
        const size = Array.isArray(data) ? data.length : data ? Object.keys(data).length : 0;
        console.log(`✔ ${test.name} (rows: ${size})`);
      }
    } catch (error) {
      failures++;
      console.error(`✖ ${test.name}:`, error.message || error);
    }
  }

  if (failures) {
    console.error(`Tests completed with ${failures} failure(s).`);
    process.exit(1);
  }

  console.log('All Supabase tests passed.');
}

main();