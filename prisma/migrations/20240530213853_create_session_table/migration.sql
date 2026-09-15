-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryWorkspace" (
    "shop" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GalleryWorkspace_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ArtistReport" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyRun" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArtistReport_shop_createdAt_idx" ON "ArtistReport"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistReport_shop_month_artistId_key" ON "ArtistReport"("shop", "month", "artistId");

-- CreateIndex
CREATE INDEX "MonthlyRun_shop_createdAt_idx" ON "MonthlyRun"("shop", "createdAt");
