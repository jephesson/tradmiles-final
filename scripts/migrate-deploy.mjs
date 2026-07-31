/**
 * Roda migrate só se houver migration pendente.
 * Usa host Neon sem `-pooler` (advisory lock não funciona no PgBouncer → P1002).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

function toDirectUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  return raw.replace(/-pooler\./g, ".");
}

function localMigrationNames() {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+/.test(d.name))
    .map((d) => d.name)
    .sort();
}

const pooled = process.env.DATABASE_URL || "";
const direct = process.env.DIRECT_URL || toDirectUrl(pooled);

if (!direct) {
  console.error("DATABASE_URL (ou DIRECT_URL) é obrigatória para migrate deploy.");
  process.exit(1);
}

if (pooled.includes("-pooler.") && !direct.includes("-pooler.")) {
  console.log("migrate: usando conexão direta (sem -pooler).");
}

const local = localMigrationNames();
const client = new pg.Client({
  connectionString: direct,
  connectionTimeoutMillis: 20_000,
});

try {
  await client.connect();

  // Libera locks de migrate órfãos (sessões idle que ainda seguram o advisory lock).
  const locks = await client.query(
    `SELECT l.pid
     FROM pg_locks l
     JOIN pg_stat_activity a ON a.pid = l.pid
     WHERE l.locktype = 'advisory'
       AND l.objid = 72707369
       AND l.granted = true
       AND a.pid <> pg_backend_pid()
       AND a.state = 'idle'`
  );
  for (const row of locks.rows) {
    console.log(`migrate: liberando advisory lock órfão (pid ${row.pid})`);
    await client.query("SELECT pg_terminate_backend($1)", [row.pid]);
  }

  const applied = await client.query(
    `SELECT migration_name
     FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL`
  );
  const done = new Set(applied.rows.map((r) => String(r.migration_name)));
  const pending = local.filter((name) => !done.has(name));

  if (!pending.length) {
    console.log("migrate: nenhuma migration pendente — pulando prisma migrate deploy.");
    await client.end();
    process.exit(0);
  }

  console.log(`migrate: ${pending.length} pendente(s): ${pending.join(", ")}`);
  await client.end();
} catch (err) {
  console.warn(
    "migrate: não deu para checar pendências, tentando deploy mesmo assim:",
    err instanceof Error ? err.message : err
  );
  try {
    await client.end();
  } catch {
    /* ignore */
  }
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: direct },
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
