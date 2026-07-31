// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

/**
 * Migrate precisa de conexão direta (sem -pooler).
 * Em runtime o app continua com DATABASE_URL pooled via lib/prisma.ts.
 */
function migrateUrl() {
  const direct = process.env.DIRECT_URL?.trim();
  if (direct) return direct;
  const pooled = process.env.DATABASE_URL || "";
  return pooled.replace(/-pooler\./g, ".") || pooled;
}

process.env.DATABASE_URL = migrateUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
