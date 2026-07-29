-- Controle do e-mail de confirmação de voo (Smiles).
ALTER TABLE "sales" ADD COLUMN "smilesConfirmEmailSentAt" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "smilesConfirmEmailSentById" TEXT;
ALTER TABLE "sales" ADD COLUMN "smilesConfirmPassengerNames" TEXT;
