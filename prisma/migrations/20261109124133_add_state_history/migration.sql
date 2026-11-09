-- CreateTable
CREATE TABLE "StateHistory" (
    "id" SERIAL NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StateHistory_entityName_entityId_idx" ON "StateHistory"("entityName", "entityId");
