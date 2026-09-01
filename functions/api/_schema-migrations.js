const runningMigrations = new Map();
let migrationLedgerPromise = null;

async function ensureMigrationLedger(env) {
  if (!migrationLedgerPromise) {
    migrationLedgerPromise = env.DB.prepare(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  }
  try {
    await migrationLedgerPromise;
  } catch (error) {
    migrationLedgerPromise = null;
    throw error;
  }
}

export async function runSchemaMigrationOnce(env, name, migrate) {
  if (runningMigrations.has(name)) return runningMigrations.get(name);

  const promise = (async () => {
    await ensureMigrationLedger(env);
    // Claim the migration atomically so parallel Worker isolates do not repeat
    // the same full-table backfill during a deployment.
    const claim = await env.DB.prepare('INSERT OR IGNORE INTO schema_migrations(name) VALUES(?)')
      .bind(name).run();
    if (Number(claim?.meta?.changes || 0) === 0) return false;

    try {
      await migrate();
      return true;
    } catch (error) {
      await env.DB.prepare('DELETE FROM schema_migrations WHERE name=?').bind(name).run();
      throw error;
    }
  })();

  runningMigrations.set(name, promise);
  try {
    return await promise;
  } catch (error) {
    runningMigrations.delete(name);
    throw error;
  }
}
