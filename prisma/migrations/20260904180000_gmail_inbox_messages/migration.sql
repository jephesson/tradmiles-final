-- CreateTable
CREATE TABLE "gmail_inbox_sync" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mailbox" TEXT NOT NULL DEFAULT '',
    "historyId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_inbox_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmail_inbox_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "internalDate" TIMESTAMP(3) NOT NULL,
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromAddress" TEXT NOT NULL DEFAULT '',
    "recipients" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "snippet" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "unread" BOOLEAN NOT NULL DEFAULT false,
    "program" TEXT,
    "cedenteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gmail_inbox_messages_internalDate_idx" ON "gmail_inbox_messages"("internalDate");

-- CreateIndex
CREATE INDEX "gmail_inbox_messages_cedenteId_idx" ON "gmail_inbox_messages"("cedenteId");

-- CreateIndex
CREATE INDEX "gmail_inbox_messages_program_internalDate_idx" ON "gmail_inbox_messages"("program", "internalDate");

-- CreateIndex
CREATE INDEX "gmail_inbox_messages_fromAddress_idx" ON "gmail_inbox_messages"("fromAddress");
