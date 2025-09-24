import { RDSDataClient, ExecuteStatementCommand } from 'npm:@aws-sdk/client-rds-data@3.637.0';

const client = new RDSDataClient({
  region: Deno.env.get('AURORA_REGION') || Deno.env.get('AWS_REGION'),
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
  },
});

const BASE = {
  resourceArn: Deno.env.get('AURORA_CLUSTER_ARN'),
  secretArn: Deno.env.get('AURORA_SECRET_ARN'),
  database: Deno.env.get('AURORA_DB_NAME') || Deno.env.get('AURORA_DB'),
};

function toParam(name, value) {
  if (value === null || value === undefined) return { name, value: { isNull: true } };
  if (typeof value === 'number' && Math.floor(value) === value) return { name, value: { longValue: value } };
  if (typeof value === 'number') return { name, value: { doubleValue: value } };
  if (typeof value === 'boolean') return { name, value: { booleanValue: value } };
  return { name, value: { stringValue: String(value) } };
}

function cellValue(cell) {
  if (!cell) return null;
  if ('stringValue' in cell) return cell.stringValue;
  if ('longValue' in cell) return cell.longValue;
  if ('doubleValue' in cell) return cell.doubleValue;
  if ('booleanValue' in cell) return cell.booleanValue;
  if ('isNull' in cell && cell.isNull) return null;
  return null;
}

export function rowsToObjects(records = [], meta = []) {
  return (records || []).map((row) => {
    const obj = {};
    row.forEach((cell, i) => {
      const colName = meta && meta[i] && meta[i].name ? meta[i].name : `col_${i}`;
      obj[colName] = cellValue(cell);
    });
    return obj;
  });
}

export async function query(sql, params = {}) {
  const parameters = Object.keys(params).map((k) => toParam(k, params[k]));
  const res = await client.send(new ExecuteStatementCommand({
    ...BASE,
    sql,
    parameters,
    includeResultMetadata: true
  }));
  return rowsToObjects(res.records || [], res.columnMetadata || []);
}