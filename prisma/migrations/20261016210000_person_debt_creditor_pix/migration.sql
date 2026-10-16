-- CreateTable
CREATE TABLE "person_debt_creditors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pixTipo" "PixTipo",
    "chavePix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_debt_creditors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_debt_creditors_name_key" ON "person_debt_creditors"("name");
