
import { query } from './auroraClient.js';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const maxRows = await query('SELECT MAX(date) AS max_date FROM predictions');
    const maxDate = Array.isArray(maxRows) && maxRows.length > 0 ? maxRows[0].max_date : null;

    if (!maxDate) {
      return Response.json({ date: null, rows: [] });
    }

    const d = String(maxDate).slice(0, 10);

    const rows = await query(
      `SELECT symbol_id, date, y_pred_1d, y_pred_7d
         FROM predictions
        WHERE date = CAST(:d AS DATE)`,
      { d }
    );

    return Response.json({ date: d, rows });
  } catch (error) {
    return Response.json({ error: error && error.message ? error.message : String(error) }, { status: 500 });
  }
});
