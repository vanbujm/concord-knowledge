import * as z from "zod";

import { MAX_RESULT_LIMIT } from "@/config/display";
import { checkRateLimit, clientIdentifier } from "@/rate-limit";
import { runHybridSearch } from "@/retrieval/hybrid-search";

// The web UI's search endpoint. It is the browser-facing sibling of the MCP
// server: both apply the same per-IP rate limit and call the same shared
// retrieval core, so the two surfaces rank identically. The response is the
// bounded, cited results array; the client renders excerpts plus deep links,
// never full page text.

const querySchema = z.object({
  q: z.string().min(1, "A search query is required."),
  realm: z.array(z.string()).optional(),
  sphere: z.array(z.string()).optional(),
  category: z.array(z.string()).optional(),
  season: z.array(z.string()).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_RESULT_LIMIT).optional(),
});

// A blank facet select posts an empty string; treat that as "no filter" so it
// never reaches the schema as a real (and unmatchable) value.
const blankToUndefined = (value: string | null): string | undefined =>
  value ? value : undefined;

// Facets are repeatable query params (e.g. ?category=Ceremonies&category=Rules).
// Drop blank entries and collapse an empty selection to undefined so it reads as
// "no filter on this facet".
const multiValue = (
  params: URLSearchParams,
  key: string,
): string[] | undefined => {
  const values = params.getAll(key).filter(Boolean);

  return values.length > 0 ? values : undefined;
};

export const GET = async (request: Request): Promise<Response> => {
  const allowed = await checkRateLimit(clientIdentifier(request));

  if (!allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429 },
    );
  }

  const params = new URL(request.url).searchParams;

  const parsed = querySchema.safeParse({
    q: params.get("q") ?? "",
    realm: multiValue(params, "realm"),
    sphere: multiValue(params, "sphere"),
    category: multiValue(params, "category"),
    season: multiValue(params, "season"),
    limit: blankToUndefined(params.get("limit")),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid search request.";

    return Response.json({ error: message }, { status: 400 });
  }

  const { q, realm, sphere, category, season, limit } = parsed.data;

  const results = await runHybridSearch({
    query: q,
    filters: {
      realms: realm,
      spheres: sphere,
      categories: category,
      seasons: season,
    },
    limit,
  });

  return Response.json(results);
};

export const runtime = "nodejs";
export const maxDuration = 60;
