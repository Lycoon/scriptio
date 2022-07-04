/*
  Warnings:

  - Made the column `secretsId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_secretsId_fkey";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "secretsId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_secretsId_fkey" FOREIGN KEY ("secretsId") REFERENCES "Secret"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
