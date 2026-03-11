import type { FieldDef, QueryResult } from 'pg';

const EMPTY_FIELDS: FieldDef[] = [];

export function queryResponse<Row extends Record<string, unknown>>(
  response: { rows: Row[]; rowCount?: number }
): QueryResult<Record<string, unknown>> {
  return {
    command: 'SELECT',
    rowCount: response.rowCount ?? response.rows.length,
    oid: 0,
    fields: EMPTY_FIELDS,
    rows: response.rows,
  };
}
