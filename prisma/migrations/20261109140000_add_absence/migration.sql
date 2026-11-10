-- CreateTable
CREATE TABLE "Absence" (
    "id" SERIAL NOT NULL,
    "childId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Absence_childId_date_key" ON "Absence"("childId", "date");

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
