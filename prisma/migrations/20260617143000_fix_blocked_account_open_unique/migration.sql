-- O índice antigo impedia mais de um bloqueio UNBLOCKED/CANCELED por cedente+programa.
-- O correto é permitir histórico e garantir apenas um bloqueio OPEN por vez.
DROP INDEX IF EXISTS "uniq_open_block_per_program";

CREATE UNIQUE INDEX "uniq_open_block_per_program"
ON "blocked_accounts"("cedenteId", "program")
WHERE "status" = 'OPEN';

CREATE INDEX IF NOT EXISTS "blocked_accounts_cedenteId_program_idx"
ON "blocked_accounts"("cedenteId", "program");
