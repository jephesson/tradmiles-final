-- Dados do emissor preenchidos pelo convite.
ALTER TABLE "users" ADD COLUMN "birthDate" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "bankName" TEXT;
ALTER TABLE "users" ADD COLUMN "meiCnpj" TEXT;
ALTER TABLE "users" ADD COLUMN "contractVersion" TEXT;
ALTER TABLE "users" ADD COLUMN "contractAcceptedAt" TIMESTAMP(3);

-- Convite (link único) para o emissor se cadastrar.
CREATE TABLE "emissor_invites" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "linkedSocioId" TEXT NOT NULL,
    "defaultFeeCardId" TEXT,
    "createdById" TEXT NOT NULL,
    "totpSecretEnc" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userId" TEXT,
    "contractVersion" TEXT,
    "contractText" TEXT,
    "acceptIp" TEXT,
    "acceptUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emissor_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "emissor_invites_token_key" ON "emissor_invites"("token");
CREATE INDEX "emissor_invites_team_idx" ON "emissor_invites"("team");
