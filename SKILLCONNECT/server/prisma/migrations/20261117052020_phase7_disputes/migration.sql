-- CreateEnum
CREATE TYPE "DisputeType" AS ENUM ('ISSUE', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'AWAITING_RESPONSE', 'IN_REVIEW', 'RESOLVED');

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "type" "DisputeType" NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "accused_user_id" UUID,
    "reason" TEXT NOT NULL,
    "response" TEXT,
    "responded_at" TIMESTAMPTZ(3),
    "response_deadline" TIMESTAMPTZ(3),
    "status" "DisputeStatus" NOT NULL,
    "outcome" "BookingStatus",
    "resolution_note" TEXT,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disputes_booking_id_idx" ON "disputes"("booking_id");

-- CreateIndex
CREATE INDEX "disputes_status_response_deadline_idx" ON "disputes"("status", "response_deadline");

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_accused_user_id_fkey" FOREIGN KEY ("accused_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
