/**
 * Roda `prisma migrate deploy` na conexão direta do Neon.
 * O host `-pooler` (PgBouncer) não sustenta pg_advisory_lock → P1002 no Vercel.
 */
import { spawnSync } from "node:child_process";

function toDirectUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  // ep-xxx-pooler.region → ep-xxx.region
  return raw.replace(/-pooler\./g, ".");
}

const pooled = process.env.DATABASE_URL || "";
const direct = process.env.DIRECT_URL || toDirectUrl(pooled);

if (!direct) {
  console.error("DATABASE_URL (ou DIRECT_URL) é obrigatória para migrate deploy.");
  process.exit(1);
}

if (direct.includes("-pooler.")) {
  console.warn(
    "Aviso: migrate ainda aponta para host -pooler; advisory lock pode falhar."
  );
} else if (pooled.includes("-pooler.") && direct !== pooled) {
  console.log("migrate deploy: usando conexão direta (sem -pooler).");
}

const result = spawnSync(
  "npx",
  ["prisma", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: direct },
    shell: process.platform === "win32",
  }
);

process.exit(result.status ?? 1);
