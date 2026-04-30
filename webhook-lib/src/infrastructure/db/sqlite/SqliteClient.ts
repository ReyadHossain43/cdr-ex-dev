import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs, { type Database } from 'sql.js';

const nodeRequire = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));

export function defaultSqliteMigrationPath(): string {
  return join(__dirname, '../../../../migrations/sqlite/init.sql');
}

export class SqliteClient {
  private constructor(
    private readonly filePath: string,
    private readonly db: Database,
  ) {}

  static async open(
    filePath: string,
    migrationSqlPath: string = defaultSqliteMigrationPath(),
  ): Promise<SqliteClient> {
    const sqlJsEntry = dirname(nodeRequire.resolve('sql.js'));
    const SQL = await initSqlJs({ locateFile: (file) => join(sqlJsEntry, file) });
    const dir = dirname(filePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const buf = existsSync(filePath) ? await readFile(filePath) : undefined;
    const db = buf ? new SQL.Database(buf) : new SQL.Database();
    const sql = readFileSync(migrationSqlPath, 'utf8');
    db.exec(sql);
    // Keep older DB files compatible when new columns are added.
    try {
      db.exec(`ALTER TABLE webhook_jobs ADD COLUMN idempotency_key TEXT`);
    } catch {}
    try {
      db.exec(`ALTER TABLE webhook_jobs ADD COLUMN lease_owner TEXT`);
    } catch {}
    try {
      db.exec(`ALTER TABLE webhook_jobs ADD COLUMN lease_expires_at TEXT`);
    } catch {}
    try {
      db.exec(`ALTER TABLE webhook_jobs ADD COLUMN processing_started_at TEXT`);
    } catch {}
    db.exec(`UPDATE webhook_jobs SET idempotency_key = id WHERE idempotency_key IS NULL`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_jobs_idempotency_key ON webhook_jobs (idempotency_key)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_jobs_lease ON webhook_jobs (status, lease_expires_at)`);
    const client = new SqliteClient(filePath, db);
    await client.persist();
    return client;
  }

  async persist(): Promise<void> {
    await writeFile(this.filePath, Buffer.from(this.db.export()));
  }

  run(sql: string, params: unknown[] = []): void {
    this.db.run(sql, params as never[]);
  }

  runMutating(sql: string, params: unknown[] = []): number {
    this.db.run(sql, params as never[]);
    const n = this.db.getRowsModified();
    void this.persist();
    return n;
  }

  get<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as never[]);
    if (!stmt.step()) {
      stmt.free();
      return undefined;
    }
    const row = stmt.getAsObject() as T;
    stmt.free();
    return row;
  }

  all<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as never[]);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  async close(): Promise<void> {
    await this.persist();
    this.db.close();
  }
}
