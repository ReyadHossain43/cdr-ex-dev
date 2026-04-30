import { randomUUID } from "node:crypto";
import type { Subscriber } from "../../../core/entities/Subscriber.js";
import type { SubscriberRepository } from "../../../core/ports/SubscriberRepository.js";
import type { SqliteClient } from "./SqliteClient.js";

function rowToSubscriber(row: {
  id: string;
  event: string;
  url: string;
  created_at: string;
}): Subscriber {
  return {
    id: row.id,
    event: row.event,
    url: row.url,
    createdAt: new Date(row.created_at),
  };
}

export class SqliteSubscriberRepository implements SubscriberRepository {
  constructor(private readonly sqlite: SqliteClient) {}

  async add(event: string, url: string): Promise<Subscriber> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.sqlite.runMutating(
      `INSERT OR IGNORE INTO subscribers (id, event, url, created_at) VALUES (?, ?, ?, ?)`,
      [id, event, url, createdAt],
    );
    const row = this.sqlite.get<{
      id: string;
      event: string;
      url: string;
      created_at: string;
    }>(
      `SELECT id, event, url, created_at FROM subscribers WHERE event = ? AND url = ?`,
      [event, url],
    );
    if (!row) throw new Error("subscriber insert failed");
    return rowToSubscriber(row);
  }

  async *streamByEvent(event: string): AsyncIterable<Subscriber> {
    const rows = this.sqlite.all<{
      id: string;
      event: string;
      url: string;
      created_at: string;
    }>(`SELECT id, event, url, created_at FROM subscribers WHERE event = ?`, [
      event,
    ]);
    for (const row of rows) {
      yield rowToSubscriber(row);
    }
  }
}
