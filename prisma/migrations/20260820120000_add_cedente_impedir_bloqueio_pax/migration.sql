-- Contas que não podem ultrapassar o limite de passageiros na emissão.
ALTER TABLE "cedentes" ADD COLUMN IF NOT EXISTS "impedirBloqueioPax" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "cedentes_impedirBloqueioPax_idx" ON "cedentes"("impedirBloqueioPax");
