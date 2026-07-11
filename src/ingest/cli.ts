import { prisma } from "@/db/client";
import { countRevisionChanges } from "@/ingest/detect-changes";
import { fetchPageRevisions, fetchWikiPages } from "@/ingest/fetch-wiki";
import { syncPages } from "@/ingest/upsert";
import { logEvent } from "@/log";
import { assertEmbeddingParity } from "@/retrieval/embedding";

// The stored latest revision id per page, for comparing against the wiki's
// current revisions during change detection.
const loadStoredRevisions = async (): Promise<Map<number, number>> => {
  const documents = await prisma.document.findMany({
    select: { pageId: true, lastRevId: true },
  });

  return new Map(
    documents.map((document) => [document.pageId, document.lastRevId]),
  );
};

// Index-time ingestion entrypoint. Runs under Bun (locally or in CI), never on
// Vercel. Pass --full to re-embed every page; the default is incremental.
const main = async () => {
  const forceAll = process.argv.includes("--full");

  logEvent("ingest_start", { forceAll });

  // Cheap gate first: fetch just the revision ids and compare them against the
  // store. When nothing changed we stop here, before loading the embedding
  // model or fetching any page content, so idle days finish in seconds. --full
  // always does the work.
  if (!forceAll) {
    const wikiRevisions = await fetchPageRevisions();
    const storedRevisions = await loadStoredRevisions();

    const changeCount = countRevisionChanges({
      wiki: wikiRevisions,
      stored: storedRevisions,
    });

    if (changeCount === 0) {
      logEvent("ingest_no_changes", { pages: wikiRevisions.size });
      return;
    }

    logEvent("ingest_changes_detected", { changed: changeCount });
  }

  await assertEmbeddingParity();
  logEvent("ingest_parity_ok");

  const pages = await fetchWikiPages();
  const summary = await syncPages({ pages, forceAll });

  logEvent("ingest_done", { pages: pages.length, ...summary });
};

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((ingestError) => {
    logEvent("ingest_failed", {
      error: ingestError instanceof Error ? ingestError.message : String(ingestError),
    });
    console.error(ingestError);
    process.exit(1);
  });
