-- Limpa a agenda a partir de 14/10/2026 para o novo critério de turnos.
UPDATE "agenda_events"
SET
  "status" = 'CANCELED',
  "canceledAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "status" = 'ACTIVE'
  AND "dateISO" >= '2026-10-14';
