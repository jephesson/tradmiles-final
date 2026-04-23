-- Auditoria para ajustes administrativos de vendas.
CREATE TABLE "sale_audit_logs" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLogin" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_audit_logs_saleId_createdAt_idx" ON "sale_audit_logs"("saleId", "createdAt");
CREATE INDEX "sale_audit_logs_actorId_idx" ON "sale_audit_logs"("actorId");

ALTER TABLE "sale_audit_logs"
ADD CONSTRAINT "sale_audit_logs_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_audit_logs"
ADD CONSTRAINT "sale_audit_logs_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
