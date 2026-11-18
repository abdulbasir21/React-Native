-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationDecision" AS ENUM ('APPROVED', 'REJECTED', 'SUSPENDED', 'REINSTATED');

-- DropIndex
DROP INDEX "localities_center_gist_idx";

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "photo_url" TEXT,
    "photo_file_id" TEXT,
    "description" TEXT,
    "experience_years" INTEGER,
    "status" "ProviderStatus" NOT NULL DEFAULT 'DRAFT',
    "is_accepting_work" BOOLEAN NOT NULL DEFAULT true,
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_services" (
    "id" UUID NOT NULL,
    "provider_profile_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_areas" (
    "id" UUID NOT NULL,
    "provider_profile_id" UUID NOT NULL,
    "locality_id" UUID NOT NULL,
    "center" geography(Point, 4326) NOT NULL,
    "radius_km" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_windows" (
    "id" UUID NOT NULL,
    "provider_profile_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_media" (
    "id" UUID NOT NULL,
    "provider_profile_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_verifications" (
    "id" UUID NOT NULL,
    "provider_profile_id" UUID NOT NULL,
    "decision" "VerificationDecision" NOT NULL,
    "reason" TEXT,
    "reviewed_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_user_id_key" ON "provider_profiles"("user_id");

-- CreateIndex
CREATE INDEX "provider_profiles_status_idx" ON "provider_profiles"("status");

-- CreateIndex
CREATE INDEX "provider_services_category_id_idx" ON "provider_services"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_services_provider_profile_id_category_id_title_key" ON "provider_services"("provider_profile_id", "category_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "service_areas_provider_profile_id_key" ON "service_areas"("provider_profile_id");

-- CreateIndex
CREATE INDEX "service_areas_locality_id_idx" ON "service_areas"("locality_id");

-- CreateIndex
CREATE INDEX "availability_windows_provider_profile_id_day_of_week_idx" ON "availability_windows"("provider_profile_id", "day_of_week");

-- CreateIndex
CREATE INDEX "portfolio_media_provider_profile_id_sort_order_idx" ON "portfolio_media"("provider_profile_id", "sort_order");

-- CreateIndex
CREATE INDEX "provider_verifications_provider_profile_id_created_at_idx" ON "provider_verifications"("provider_profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_provider_profile_id_fkey" FOREIGN KEY ("provider_profile_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_provider_profile_id_fkey" FOREIGN KEY ("provider_profile_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_provider_profile_id_fkey" FOREIGN KEY ("provider_profile_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_media" ADD CONSTRAINT "portfolio_media_provider_profile_id_fkey" FOREIGN KEY ("provider_profile_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_verifications" ADD CONSTRAINT "provider_verifications_provider_profile_id_fkey" FOREIGN KEY ("provider_profile_id") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_verifications" ADD CONSTRAINT "provider_verifications_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints and spatial index
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_radius_km_check" CHECK ("radius_km" BETWEEN 1 AND 30);
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_day_check" CHECK ("day_of_week" BETWEEN 1 AND 7);
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_time_check" CHECK ("start_time" < "end_time");
CREATE INDEX "service_areas_center_gist_idx" ON "service_areas" USING GIST ("center");
