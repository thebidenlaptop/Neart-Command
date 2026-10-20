import pg from 'pg';

export type Row = Record<string, any>;

export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  return {
    query: (sql, params) => pool.query(sql, params as unknown[]),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (sql, params) => client.query(sql, params as unknown[]) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
