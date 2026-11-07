-- CreateTable
CREATE TABLE "voarfacil_orders" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "createdById" TEXT,
    "code" TEXT NOT NULL,
    "pedido" TEXT,
    "url" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fill" JSONB,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voarfacil_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voarfacil_orders_team_code_key" ON "voarfacil_orders"("team", "code");

-- CreateIndex
CREATE INDEX "voarfacil_orders_team_updatedAt_idx" ON "voarfacil_orders"("team", "updatedAt");
