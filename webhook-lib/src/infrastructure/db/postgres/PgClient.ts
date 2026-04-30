export class PgClient {
  constructor(_connectionString: string) {}

  async connect(): Promise<void> {
    throw new Error('Postgres adapter is not implemented yet; use sqlitePath with SqliteClient.');
  }

  async close(): Promise<void> {}
}
