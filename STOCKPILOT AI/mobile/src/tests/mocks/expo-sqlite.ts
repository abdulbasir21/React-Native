import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

class NodeSqliteWrapper {
  private db: DatabaseSync;

  constructor(name: string) {
    this.db = new DatabaseSync(name === ':memory:' ? ':memory:' : name);
  }

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async runAsync(
    source: string,
    ...params: SQLInputValue[]
  ): Promise<{ lastInsertRowId: number; changes: number }> {
    const stmt = this.db.prepare(source);
    const res = stmt.run(...params);
    return {
      lastInsertRowId: Number(res.lastInsertRowid ?? 0),
      changes: Number(res.changes ?? 0),
    };
  }

  async getFirstAsync<T>(source: string, ...params: SQLInputValue[]): Promise<T | null> {
    const stmt = this.db.prepare(source);
    const row = stmt.get(...params);
    return (row as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: SQLInputValue[]): Promise<T[]> {
    const stmt = this.db.prepare(source);
    return stmt.all(...params) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (txn: NodeSqliteWrapper) => Promise<void>,
  ): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

export async function openDatabaseAsync(name: string) {
  return new NodeSqliteWrapper(name);
}

export type SQLiteDatabase = NodeSqliteWrapper;
