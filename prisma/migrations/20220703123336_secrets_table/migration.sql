/*
  Warnings:

  - You are about to drop the column `active` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailHash` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `hash` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `salt` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[secretsId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "active",
DROP COLUMN "emailHash",
DROP COLUMN "hash",
DROP COLUMN "salt",
ADD COLUMN     "secretsId" INTEGER,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Secret" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_secretsId_key" ON "User"("secretsId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_secretsId_fkey" FOREIGN KEY ("secretsId") REFERENCES "Secret"("id") ON DELETE SET NULL ON UPDATE CASCADE;
