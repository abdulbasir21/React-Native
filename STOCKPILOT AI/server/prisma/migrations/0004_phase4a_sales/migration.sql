-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerId" UUID,
    "receiptNo" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "note" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "unitSnapshot" "Unit" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "allocatedDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineNet" DECIMAL(14,2) NOT NULL,
    "unitCostSnapshot" DECIMAL(14,4) NOT NULL,
    "lineCogs" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_shopId_occurredAt_idx" ON "sales"("shopId", "occurredAt");

-- CreateIndex
CREATE INDEX "sales_shopId_customerId_idx" ON "sales"("shopId", "customerId");

-- CreateIndex
CREATE INDEX "sales_shopId_status_idx" ON "sales"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_shopId_idempotencyKey_key" ON "sales"("shopId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "sales_shopId_receiptNo_key" ON "sales"("shopId", "receiptNo");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE INDEX "sale_items_productId_idx" ON "sale_items"("productId");

-- CreateIndex
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");

-- CreateIndex
CREATE INDEX "stock_movements_saleId_idx" ON "stock_movements"("saleId");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "sales"
  ADD CONSTRAINT "sales_non_negative_subtotal" CHECK ("subtotal" >= 0),
  ADD CONSTRAINT "sales_valid_discount" CHECK ("discountAmount" >= 0 AND "discountAmount" <= "subtotal"),
  ADD CONSTRAINT "sales_non_negative_total" CHECK ("total" >= 0 AND "total" = "subtotal" - "discountAmount");

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_positive_qty" CHECK ("quantity" > 0),
  ADD CONSTRAINT "sale_items_non_negative_money" CHECK (
    "unitPrice" >= 0 AND "lineSubtotal" >= 0 AND "allocatedDiscount" >= 0 AND
    "lineNet" >= 0 AND "unitCostSnapshot" >= 0 AND "lineCogs" >= 0
  );

