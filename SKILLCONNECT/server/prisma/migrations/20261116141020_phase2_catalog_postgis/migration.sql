-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "LocalityLevel" AS ENUM ('PROVINCE', 'DISTRICT', 'LOCALITY');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "level" "LocalityLevel" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "center" geography(Point, 4326) NOT NULL,
    "is_serviceable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "localities_slug_key" ON "localities"("slug");

-- CreateIndex
CREATE INDEX "localities_parent_id_idx" ON "localities"("parent_id");

-- CreateIndex
CREATE INDEX "localities_level_is_serviceable_idx" ON "localities"("level", "is_serviceable");

-- AddForeignKey
ALTER TABLE "localities" ADD CONSTRAINT "localities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- PostGIS GIST spatial index
CREATE INDEX "localities_center_gist_idx" ON "localities" USING GIST ("center");
