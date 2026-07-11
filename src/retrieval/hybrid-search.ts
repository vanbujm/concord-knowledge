import {
  DEFAULT_RESULT_LIMIT,
  MAX_EXCERPT_CHARS,
  MAX_RESULT_LIMIT,
} from "@/config/display";
import { prisma } from "@/db/client";
import { logEvent } from "@/log";
import { embedText } from "@/retrieval/embedding";
import {
  buildExcerpt,
  queryTerms,
  type HighlightRange,
} from "@/retrieval/excerpt";

// The shared retrieval core, imported by both the web route and the MCP server.
// It fuses a semantic (pgvector) ranking with a keyword (Postgres full-text)
// ranking using Reciprocal Rank Fusion, so exact names and paraphrases both
// surface. Every result carries its source URL and a bounded excerpt.

// The RRF constant: score = sum over rankers of 1 / (k + rank). k = 60 is the
// Cormack et al. default, large enough that no single ranker dominates.
const RRF_K = 60;

// How many candidates each ranker contributes before fusion.
const CANDIDATE_POOL_SIZE = 50;

export type SearchFilters = {
  realm?: string;
  sphere?: string;
  pageType?: string;
};

export type SearchResult = {
  chunkId: string;
  title: string;
  headingPath: string;
  excerpt: string;
  highlights: HighlightRange[];
  sourceUrl: string;
  pageType: string;
  realm: string | null;
  sphere: string | null;
  seasons: string[];
  score: number;
};

type FusedRow = { id: string; score: number };

const clampLimit = (limit: number | undefined): number => {
  if (!limit || limit < 1) {
    return DEFAULT_RESULT_LIMIT;
  }

  return Math.min(limit, MAX_RESULT_LIMIT);
};

export const runHybridSearch = async (input: {
  query: string;
  filters?: SearchFilters;
  limit?: number;
}): Promise<SearchResult[]> => {
  const { query, filters = {}, limit } = input;
  const startedAt = performance.now();

  const resultLimit = clampLimit(limit);
  const realm = filters.realm ?? null;
  const sphere = filters.sphere ?? null;
  const pageType = filters.pageType ?? null;

  const queryVector = await embedText(query, "query");
  const vectorLiteral = JSON.stringify(queryVector);

  // One round-trip: filter, rank each way over the candidate pool, fuse by RRF.
  const fused = await prisma.$queryRaw<FusedRow[]>`
    WITH filtered AS (
      SELECT c.id, c.embedding, c."searchVector"
      FROM "Chunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE (${realm}::text IS NULL OR d.realm = ${realm})
        AND (${sphere}::text IS NULL OR d.sphere = ${sphere})
        AND (${pageType}::text IS NULL OR d."pageType" = ${pageType})
    ),
    vec AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> ${vectorLiteral}::vector) AS rank
      FROM filtered
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${CANDIDATE_POOL_SIZE}
    ),
    kw AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd("searchVector", q) DESC) AS rank
      FROM filtered, websearch_to_tsquery('english', ${query}) q
      WHERE "searchVector" @@ q
      ORDER BY ts_rank_cd("searchVector", q) DESC
      LIMIT ${CANDIDATE_POOL_SIZE}
    )
    SELECT ids.id,
           (COALESCE(1.0 / (${RRF_K} + vec.rank), 0)
             + COALESCE(1.0 / (${RRF_K} + kw.rank), 0))::double precision AS score
    FROM (SELECT id FROM vec UNION SELECT id FROM kw) ids
    LEFT JOIN vec ON vec.id = ids.id
    LEFT JOIN kw ON kw.id = ids.id
    ORDER BY score DESC
    LIMIT ${resultLimit}
  `;

  const chunkRows = await prisma.chunk.findMany({
    where: { id: { in: fused.map((row) => row.id) } },
    select: {
      id: true,
      text: true,
      headingPath: true,
      document: {
        select: {
          title: true,
          sourceUrl: true,
          pageType: true,
          realm: true,
          sphere: true,
          seasons: true,
        },
      },
    },
  });

  const chunkById = new Map(chunkRows.map((chunk) => [chunk.id, chunk]));
  const terms = queryTerms(query);

  const results: SearchResult[] = [];

  for (const row of fused) {
    const chunk = chunkById.get(row.id);

    if (!chunk) {
      continue;
    }

    const excerpt = buildExcerpt({
      text: chunk.text,
      terms,
      maxChars: MAX_EXCERPT_CHARS,
    });

    results.push({
      chunkId: chunk.id,
      title: chunk.document.title,
      headingPath: chunk.headingPath,
      excerpt: excerpt.text,
      highlights: excerpt.highlights,
      sourceUrl: chunk.document.sourceUrl,
      pageType: chunk.document.pageType,
      realm: chunk.document.realm,
      sphere: chunk.document.sphere,
      seasons: chunk.document.seasons,
      score: row.score,
    });
  }

  logEvent("search", {
    query,
    filters,
    resultCount: results.length,
    topScore: results[0]?.score ?? 0,
    latencyMs: Math.round(performance.now() - startedAt),
  });

  return results;
};
