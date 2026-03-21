/*
  Warnings:

  - A unique constraint covering the columns `[checkout_request_id]` on the table `transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "phone_number" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "checkout_request_id" TEXT,
ADD COLUMN     "merchant_request_id" TEXT,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "result_code" INTEGER,
ADD COLUMN     "result_desc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_checkout_request_id_key" ON "transactions"("checkout_request_id");
