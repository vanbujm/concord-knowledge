import { prisma } from "@/db/client";
import { fetchWikiPages } from "@/ingest/fetch-wiki";
import { syncPages } from "@/ingest/upsert";
import { logEvent } from "@/log";
import { assertEmbeddingParity } from "@/retrieval/embedding";

// Index-time ingestion entrypoint. Runs under Bun (locally or in CI), never on
// Vercel. Pass --full to re-embed every page; the default is incremental.
const main = async () => {
  const forceAll = process.argv.includes("--full");

  logEvent("ingest_start", { forceAll });

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
