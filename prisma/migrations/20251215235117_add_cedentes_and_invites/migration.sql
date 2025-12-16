-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "team" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cedentes" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3),
    "cpf" TEXT NOT NULL,
    "emailCriado" TEXT,
    "chavePix" TEXT,
    "banco" TEXT,
    "senhaEmailEnc" TEXT,
    "senhaSmilesEnc" TEXT,
    "senhaLatamPassEnc" TEXT,
    "senhaLiveloEnc" TEXT,
    "senhaEsferaEnc" TEXT,
    "pontosLatam" INTEGER NOT NULL DEFAULT 0,
    "pontosSmiles" INTEGER NOT NULL DEFAULT 0,
    "pontosLivelo" INTEGER NOT NULL DEFAULT 0,
    "pontosEsfera" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cedentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cedente_invites" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "nomeHint" TEXT,
    "cpfHint" TEXT,

    CONSTRAINT "cedente_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cedente_term_acceptances" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "termoVersao" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cedente_term_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cedentes_identificador_key" ON "cedentes"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "cedentes_cpf_key" ON "cedentes"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "cedente_invites_tokenHash_key" ON "cedente_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "cedente_invites_expiresAt_idx" ON "cedente_invites"("expiresAt");

-- CreateIndex
CREATE INDEX "cedente_term_acceptances_cedenteId_idx" ON "cedente_term_acceptances"("cedenteId");

-- AddForeignKey
ALTER TABLE "cedente_term_acceptances" ADD CONSTRAINT "cedente_term_acceptances_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
