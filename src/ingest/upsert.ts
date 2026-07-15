import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@/db/client";
import { chunkPage, type PageChunk } from "@/ingest/chunk";
import { cleanWikitext } from "@/ingest/clean-wikitext";
import { deriveFacets } from "@/ingest/derive-facets";
import type { WikiPage } from "@/ingest/fetch-wiki";
import { logEvent } from "@/log";
import { embedTexts } from "@/retrieval/embedding";

const WIKI_BASE_URL =
  process.env.CONCORD_WIKI_BASE_URL ?? "https://wiki.concordlarp.com";

const TRANSACTION_TIMEOUT_MS = 1000 * 60 * 2;

export const computeContentHash = (wikitext: string): string =>
  createHash("sha1").update(wikitext).digest("hex");

// Canonical URL of a page on the live wiki, for attribution and deep links.
export const sourceUrlForTitle = (title: string): string =>
  `${WIKI_BASE_URL}/index.php?title=${encodeURIComponent(title.replace(/ /g, "_"))}`;

type StoredPageState = { lastRevId: number; contentHash: string };

// A page is re-indexed only when it is new, its revision changed, or its
// content hash changed. This is what lets a re-run skip untouched pages and
// embed nothing.
export const pageNeedsReindex = (input: {
  page: Pick<WikiPage, "wikitext" | "lastRevId">;
  stored: StoredPageState | undefined;
}): boolean => {
  const { page, stored } = input;

  if (!stored) {
    return true;
  }

  return (
    stored.lastRevId !== page.lastRevId ||
    stored.contentHash !== computeContentHash(page.wikitext)
  );
};

// The text handed to the embedding model: the chunk prefixed with its page and
// section, so the vector carries that context. bge-small truncates at 512
// tokens, so the tail of a very large chunk is covered by keyword search rather
// than the vector; the stored chunk text is always the full slice.
const embeddingInput = (title: string, chunk: PageChunk): string =>
  chunk.headingPath
    ? `${title} > ${chunk.headingPath}\n${chunk.text}`
    : `${title}\n${chunk.text}`;

// Clean, chunk, facet, embed, and atomically replace one page's document + chunks.
const reindexPage = async (page: WikiPage): Promise<number> => {
  const cleaned = cleanWikitext(page.wikitext);
  const chunks = chunkPage(cleaned);
  const facets = deriveFacets({
    title: page.title,
    categories: page.categories,
    wikitext: page.wikitext,
  });
  const contentHash = computeContentHash(page.wikitext);

  const embeddings =
    chunks.length > 0
      ? await embedTexts(
          chunks.map((chunk) => embeddingInput(page.title, chunk)),
          "document",
        )
      : [];

  const documentData = {
    title: page.title,
    sourceUrl: sourceUrlForTitle(page.title),
    lastRevId: page.lastRevId,
    contentHash,
    categories: page.categories,
    realm: facets.realm,
    sphere: facets.sphere,
    seasons: facets.seasons,
  };

  await prisma.$transaction(
    async (tx) => {
      const document = await tx.document.upsert({
        where: { pageId: page.pageId },
        create: { pageId: page.pageId, ...documentData },
        update: documentData,
      });

      await tx.chunk.deleteMany({ where: { documentId: document.id } });

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const vectorLiteral = JSON.stringify(embeddings[index]);

        await tx.$executeRaw`
          INSERT INTO "Chunk" (id, "documentId", ordinal, "headingPath", text, "tokenCount", "charStart", "charEnd", embedding)
          VALUES (${randomUUID()}, ${document.id}, ${chunk.ordinal}, ${chunk.headingPath}, ${chunk.text}, ${chunk.tokenCount}, ${chunk.charStart}, ${chunk.charEnd}, ${vectorLiteral}::vector)
        `;
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );

  return chunks.length;
};

export type SyncSummary = {
  reindexed: number;
  skipped: number;
  chunksWritten: number;
  removed: number;
};

// Reconcile the database against a freshly fetched set of wiki pages.
export const syncPages = async (input: {
  pages: WikiPage[];
  forceAll: boolean;
}): Promise<SyncSummary> => {
  const { pages, forceAll } = input;

  const storedDocuments = await prisma.document.findMany({
    select: { pageId: true, lastRevId: true, contentHash: true },
  });

  const storedByPageId = new Map(
    storedDocuments.map((document) => [
      document.pageId,
      { lastRevId: document.lastRevId, contentHash: document.contentHash },
    ]),
  );

  let reindexed = 0;
  let skipped = 0;
  let chunksWritten = 0;

  for (const page of pages) {
    const stored = storedByPageId.get(page.pageId);

    if (!forceAll && !pageNeedsReindex({ page, stored })) {
      skipped += 1;
      continue;
    }

    const count = await reindexPage(page);

    reindexed += 1;
    chunksWritten += count;

    logEvent("ingest_page_reindexed", {
      pageId: page.pageId,
      title: page.title,
      chunks: count,
    });
  }

  const fetchedPageIds = new Set(pages.map((page) => page.pageId));
  const removedPageIds = storedDocuments
    .map((document) => document.pageId)
    .filter((pageId) => !fetchedPageIds.has(pageId));

  if (removedPageIds.length > 0) {
    await prisma.document.deleteMany({
      where: { pageId: { in: removedPageIds } },
    });
  }

  return { reindexed, skipped, chunksWritten, removed: removedPageIds.length };
};
