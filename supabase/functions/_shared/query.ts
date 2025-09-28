import type { QueryResult } from 'npm:pg';
import { getPool } from './db.ts';

const PARAM_REGEX = /(?<!:):(\w+)/g;

type Params = Record<string, unknown>;

type QueryConfig = {
  text: string;
  values: unknown[];
};

function buildQuery(sql: string, params: Params): QueryConfig {
  const values: unknown[] = [];
  const seen = new Map<string, number>();

  const text = sql.replace(PARAM_REGEX, (_, key: string) => {
    if (!params.hasOwnProperty(key)) {
      throw new Error(`Missing SQL parameter :${key}`);
    }
    if (seen.has(key)) {
      return `$${seen.get(key)}`;
    }
    const index = values.push(params[key]) - 1;
    seen.set(key, index + 1);
    return `$${index + 1}`;
  });

  return { text, values };
}

export async function query<T = Record<string, unknown>>(sqlText: string, params: Params = {}): Promise<T[]> {
  const pool = getPool();
  const { text, values } = buildQuery(sqlText, params);
  const client = await pool.connect();
  try {
    const result: QueryResult<T> = await client.query({ text, values });
    return result.rows;
  } finally {
    client.release();
  }
}
