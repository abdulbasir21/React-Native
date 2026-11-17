import * as SQLite from 'expo-sqlite';
import { SQLITE_MIGRATIONS } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbName = 'stockpilot.db';

export async function getLocalDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(dbName);
      await runMigrations(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);',
  );
  const appliedRows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const migration of SQLITE_MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(migration.sql);
      await txn.runAsync(
        'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        migration.version,
        new Date().toISOString(),
      );
    });
  }
}

export async function resetLocalDbForTests(nextName = ':memory:'): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) {
    const existing = await dbPromise.catch(() => null);
    if (existing && typeof existing.closeAsync === 'function') {
      await existing.closeAsync().catch(() => undefined);
    }
  }
  dbName = nextName;
  dbPromise = null;
  return getLocalDb();
}
