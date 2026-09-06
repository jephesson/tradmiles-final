-- Allow one search per airline on the same job/route/date (GOL + LATAM + Azul).
DROP INDEX IF EXISTS "cotacao_passagem_searches_jobId_direction_originIata_destIata_date_key";

CREATE UNIQUE INDEX "cotacao_passagem_searches_jobId_direction_originIata_destIata_date_airline_key"
ON "cotacao_passagem_searches"("jobId", "direction", "originIata", "destIata", "date", "airline");
