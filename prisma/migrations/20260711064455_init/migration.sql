-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "pageId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "lastRevId" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "categories" TEXT[],
    "realm" TEXT,
    "sphere" TEXT,
    "pageType" TEXT NOT NULL,
    "seasons" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Hand-edited: "searchVector" is a generated tsvector column (Prisma cannot
-- express GENERATED ALWAYS ... STORED), kept in sync automatically from "text".
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "headingPath" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "charStart" INTEGER NOT NULL,
    "charEnd" INTEGER NOT NULL,
    "embedding" vector(384),
    "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("text", ''))) STORED,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_pageId_key" ON "Document"("pageId");

-- CreateIndex
CREATE INDEX "Document_realm_idx" ON "Document"("realm");

-- CreateIndex
CREATE INDEX "Document_sphere_idx" ON "Document"("sphere");

-- CreateIndex
CREATE INDEX "Document_pageType_idx" ON "Document"("pageType");

-- CreateIndex
CREATE INDEX "Chunk_documentId_idx" ON "Chunk"("documentId");

-- CreateIndex
-- Hand-edited: keyword search index over the generated tsvector column.
CREATE INDEX "Chunk_searchVector_gin" ON "Chunk" USING GIN ("searchVector");

-- CreateIndex
-- Hand-edited: approximate-nearest-neighbour index for cosine similarity over
-- the embedding vectors. HNSW builds on an empty/growing table with no list
-- retuning, unlike IVFFlat.
CREATE INDEX "Chunk_embedding_hnsw" ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
