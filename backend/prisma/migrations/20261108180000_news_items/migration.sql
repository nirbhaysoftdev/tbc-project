-- CreateTable
CREATE TABLE "news_items" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_items_url_key" ON "news_items"("url");

-- CreateIndex
CREATE INDEX "news_items_publishedAt_idx" ON "news_items"("publishedAt");

-- CreateIndex
CREATE INDEX "news_items_source_publishedAt_idx" ON "news_items"("source", "publishedAt");
