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
import { UNCATEGORIZED_VALUE } from "@/retrieval/facets";

// The shared retrieval core, imported by both the web route and the MCP server.
// It fuses a semantic (pgvector) ranking with a keyword (Postgres full-text)
// ranking using Reciprocal Rank Fusion, so exact names and paraphrases both
// surface. Every result carries its source URL and a bounded excerpt.

// The RRF constant: score = sum over rankers of 1 / (k + rank). k = 60 is the
// Cormack et al. default, large enough that no single ranker dominates.
const RRF_K = 60;

// How many candidates each ranker contributes before fusion.
const CANDIDATE_POOL_SIZE = 50;

// Each facet holds zero or more selected values. Within a facet the values are
// OR'd (a document matches if it has any of them); across facets they are AND'd.
// An empty or absent array means "no filter on this facet".
export type SearchFilters = {
  realms?: string[];
  spheres?: string[];
  categories?: string[];
  seasons?: string[];
};

export type SearchResult = {
  chunkId: string;
  title: string;
  headingPath: string;
  excerpt: string;
  highlights: HighlightRange[];
  sourceUrl: string;
  categories: string[];
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
  const realms = filters.realms ?? [];
  const spheres = filters.spheres ?? [];
  const seasons = filters.seasons ?? [];

  // "Uncategorised" is a signal value, not a real category: it selects pages
  // with an empty category array, so it is handled by a separate SQL branch and
  // stripped from the list of real categories matched against the column.
  const categoryFilter = filters.categories ?? [];
  const includeUncategorized = categoryFilter.includes(UNCATEGORIZED_VALUE);
  const realCategories = categoryFilter.filter(
    (category) => category !== UNCATEGORIZED_VALUE,
  );

  const queryVector = await embedText(query, "query");
  const vectorLiteral = JSON.stringify(queryVector);

  // One round-trip: filter, rank each way over the candidate pool, fuse by RRF.
  const fused = await prisma.$queryRaw<FusedRow[]>`
    WITH filtered AS (
      SELECT c.id, c.embedding, c."searchVector"
      FROM "Chunk" c
      JOIN "Document" d ON d.id = c."documentId"
      -- Each facet: an empty selection array means no filter; otherwise the
      -- document must match one of the selected values. && is array overlap.
      WHERE (cardinality(${realms}::text[]) = 0 OR d.realm = ANY(${realms}::text[]))
        AND (cardinality(${spheres}::text[]) = 0 OR d.sphere = ANY(${spheres}::text[]))
        AND (cardinality(${seasons}::text[]) = 0 OR d.seasons && ${seasons}::text[])
        AND (
          (cardinality(${realCategories}::text[]) = 0 AND ${includeUncategorized} = false)
          OR d.categories && ${realCategories}::text[]
          OR (${includeUncategorized} = true AND cardinality(d.categories) = 0)
        )
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
    -- When two chunks land on the same fused score (common for a rare exact
    -- term, where each arm contributes a lone rank-1 hit), prefer the better
    -- keyword match, then the better vector match. Without this, a vague
    -- semantic-only hit can edge out an exact keyword match on a coin-flip.
    ORDER BY score DESC, kw.rank ASC NULLS LAST, vec.rank ASC NULLS LAST
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
          categories: true,
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
      categories: chunk.document.categories,
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
