/*
  Warnings:

  - Added the required column `recoverHash` to the `Secret` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Secret" ADD COLUMN     "lastRecoverHash" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "recoverHash" TEXT NOT NULL;
