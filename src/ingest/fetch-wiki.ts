import * as z from "zod";

import { logEvent } from "@/log";

// The Concord wiki is a MediaWiki instance. We read it through the official
// action=query API (not HTML scraping). Ported from scripts/sync_wiki.py, with
// one addition: we also request revision ids (rvprop=ids) so the ingestion
// pipeline can skip pages whose revision has not changed.

const WIKI_BASE_URL =
  process.env.CONCORD_WIKI_BASE_URL ?? "https://wiki.concordlarp.com";

const API_URL = `${WIKI_BASE_URL}/api.php`;

// The wiki answers HTTP 403 to default bot user-agents, so we present a browser
// one, exactly as the original Python sync script does.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1500;

// Cloudflare block pages carry a four digit code that names the product that
// refused the request, e.g. "Error 1015" for rate limiting.
const CLOUDFLARE_ERROR_CODE = /Error\s*(\d{4})/i;
const REFUSAL_SNIPPET_LENGTH = 400;

// However long a Retry-After asks for, never sit longer than this: a wildly large
// value would otherwise stall a run indefinitely.
const MAX_RETRY_AFTER_MS = 30_000;

// Retry-After is either a whole number of seconds or an HTTP date. Null when the
// header is absent or unparseable, so the caller falls back to its own backoff.
// Exported for direct unit testing.
export const parseRetryAfterMs = (header: string | null): number | null => {
  if (!header) {
    return null;
  }

  const seconds = Number(header);

  if (Number.isFinite(seconds)) {
    // A zero means "retry immediately", but a moment's pause is kinder and stops
    // a tight loop against a wiki that has just asked us to slow down.
    return Math.min(Math.max(seconds, 1) * 1000, MAX_RETRY_AFTER_MS);
  }

  const retryAt = Date.parse(header);

  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.min(Math.max(retryAt - Date.now(), 0), MAX_RETRY_AFTER_MS);
};

// The API accepts up to 50 page ids per revisions/categories request.
const PAGE_ID_BATCH_SIZE = 50;

// The wiki API accepts 50 titles per query for an unauthenticated client.
const PAGE_TITLE_BATCH_SIZE = 50;

const pageStubSchema = z.object({
  pageid: z.number(),
  title: z.string(),
});

type PageStub = z.infer<typeof pageStubSchema>;

const allPagesResponseSchema = z.object({
  query: z.object({
    allpages: z.array(pageStubSchema),
  }),
  // The continue object holds whichever continuation params this query needs
  // (for allpages: apcontinue + continue). We pass the whole object back
  // verbatim on the next request, so its exact keys do not matter here.
  continue: z.record(z.string(), z.string()).optional(),
});

// The broad shape: a page as a query returns it. Asking by title yields an entry
// for every title requested, and a title the wiki does not have arrives flagged
// `missing` with no page id at all.
const queriedPageSchema = z.object({
  pageid: z.number().optional(),
  missing: z.boolean().optional(),
  title: z.string(),
  revisions: z
    .array(
      z.object({
        revid: z.number(),
        slots: z.object({
          main: z.object({
            content: z.string().optional(),
          }),
        }),
      }),
    )
    .optional(),
  categories: z.array(z.object({ title: z.string() })).optional(),
});

// Narrower: a page asked for by id necessarily exists, so it always has one.
const pageContentSchema = queriedPageSchema.required({ pageid: true });

const pageContentsResponseSchema = z.object({
  query: z.object({
    pages: z.array(pageContentSchema),
  }),
});

const titledPagesResponseSchema = z.object({
  query: z.object({
    pages: z.array(queriedPageSchema),
  }),
});

const pageInfoSchema = z.object({
  pageid: z.number(),
  lastrevid: z.number(),
});

const pageRevisionsResponseSchema = z.object({
  query: z.object({
    pages: z.array(pageInfoSchema),
  }),
  continue: z.record(z.string(), z.string()).optional(),
});

export type WikiPage = {
  pageId: number;
  title: string;
  wikitext: string;
  lastRevId: number;
  categories: string[];
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// Call the MediaWiki API and validate the response against `schema`. Retries a
// few times on any failure (network error or validation error), then throws.
const apiGet = async <Schema extends z.ZodTypeAny>(
  params: Record<string, string>,
  schema: Schema,
): Promise<z.infer<Schema>> => {
  const query = new URLSearchParams({
    ...params,
    format: "json",
    formatversion: "2",
  });

  const url = `${API_URL}?${query.toString()}`;

  let lastError: unknown = null;

  // When the wiki rate-limits us it says how long to wait. Honour that instead of
  // the usual backoff, which is shorter and only spends more of the budget.
  let retryAfterMs: number | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": BROWSER_USER_AGENT },
      });

      if (!response.ok) {
        // The wiki sits behind Cloudflare, which sometimes refuses this client.
        // Record how it identified itself, so a failure can be attributed to a
        // product rather than guessed at: `cf-mitigated` marks a challenge, and
        // the block pages carry a four digit code (1015 rate limited, 1020
        // firewall rule, 1010 browser integrity check).
        const body = await response.text().catch(() => "");
        const errorCode = body.match(CLOUDFLARE_ERROR_CODE);
        const retryAfterHeader = response.headers.get("retry-after");

        retryAfterMs = parseRetryAfterMs(retryAfterHeader);

        logEvent("wiki_fetch_refused", {
          url,
          status: response.status,
          cfRay: response.headers.get("cf-ray"),
          cfMitigated: response.headers.get("cf-mitigated"),
          server: response.headers.get("server"),
          retryAfter: retryAfterHeader,
          cloudflareErrorCode: errorCode ? errorCode[1] : null,
          bodySnippet: body.slice(0, REFUSAL_SNIPPET_LENGTH),
        });

        throw new Error(`Wiki API returned HTTP ${response.status}`);
      }

      const payload = await response.json();

      return schema.parse(payload);
    } catch (requestError) {
      lastError = requestError;

      if (attempt < MAX_ATTEMPTS - 1) {
        await delay(retryAfterMs ?? RETRY_BASE_DELAY_MS * (attempt + 1));
        retryAfterMs = null;
      }
    }
  }

  throw new Error(`Wiki API call failed after ${MAX_ATTEMPTS} attempts: ${url}`, {
    cause: lastError,
  });
};

// Split a list into fixed-size batches. Exported for direct unit testing.
export const chunkIntoBatches = <Item>(
  items: Item[],
  batchSize: number,
): Item[][] => {
  const batches: Item[][] = [];

  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize));
  }

  return batches;
};

// List every content-namespace (ns 0) page, following continue tokens.
export const fetchAllPageStubs = async (): Promise<PageStub[]> => {
  const stubs: PageStub[] = [];

  let continueParams: Record<string, string> | undefined;

  do {
    const data = await apiGet(
      {
        action: "query",
        list: "allpages",
        apnamespace: "0",
        aplimit: "500",
        ...continueParams,
      },
      allPagesResponseSchema,
    );

    stubs.push(...data.query.allpages);
    continueParams = data.continue;

    logEvent("wiki_fetch_allpages_progress", { fetched: stubs.length });
  } while (continueParams);

  return stubs;
};

// List every ns 0 page whose title starts with `prefix`, then fetch their
// wikitext, revision ids, and categories. Lets a caller pull one page family
// (e.g. "Winds of the World") without walking the whole corpus.
export const fetchPagesByPrefix = async (
  prefix: string,
): Promise<WikiPage[]> => {
  const stubs: PageStub[] = [];

  let continueParams: Record<string, string> | undefined;

  do {
    const data = await apiGet(
      {
        action: "query",
        list: "allpages",
        apnamespace: "0",
        apprefix: prefix,
        aplimit: "500",
        ...continueParams,
      },
      allPagesResponseSchema,
    );

    stubs.push(...data.query.allpages);
    continueParams = data.continue;
  } while (continueParams);

  return fetchPageContents(stubs);
};

// Null when the wiki has no such page, which only a title query can produce: a
// page asked for by id always exists.
const normalizePage = (
  page: z.infer<typeof queriedPageSchema>,
): WikiPage | null => {
  if (page.missing || page.pageid === undefined) {
    return null;
  }

  const revision = page.revisions?.[0];

  const categories = (page.categories ?? []).map((category) =>
    category.title.replace(/^Category:/, ""),
  );

  return {
    pageId: page.pageid,
    title: page.title,
    wikitext: revision?.slots.main.content ?? "",
    // '0' signals a page with no readable revision (e.g. a stub); real pages
    // always carry a positive revid.
    lastRevId: revision?.revid ?? 0,
    categories,
  };
};

// Fetch wikitext + revid + categories for each stub, batched 50 ids at a time.
export const fetchPageContents = async (
  stubs: PageStub[],
): Promise<WikiPage[]> => {
  const batches = chunkIntoBatches(stubs, PAGE_ID_BATCH_SIZE);
  const pages: WikiPage[] = [];

  for (const batch of batches) {
    const pageIds = batch.map((stub) => String(stub.pageid)).join("|");

    const data = await apiGet(
      {
        action: "query",
        pageids: pageIds,
        prop: "revisions|categories",
        rvprop: "content|ids",
        rvslots: "main",
        // 'max' (500) comfortably covers the categories of a 50-page batch, so
        // categories never overflow into a separate continue request.
        cllimit: "max",
      },
      pageContentsResponseSchema,
    );

    for (const page of data.query.pages) {
      const normalized = normalizePage(page);

      if (normalized) {
        pages.push(normalized);
      }
    }

    logEvent("wiki_fetch_contents_progress", {
      fetched: pages.length,
      total: stubs.length,
    });
  }

  return pages;
};

// Fetch many pages by exact title in one query per 50 titles, keyed by title.
//
// The alternative, a prefix search per title, costs one request each: checking a
// season's eighteen Winds entries that way is eighteen requests every run, which
// is what drew HTTP 429 rate limiting from the wiki. This does it in one.
//
// Titles the wiki does not have are simply absent from the map, which is how a
// caller tells an unwritten page from a written one.
export const fetchPagesByTitles = async (
  titles: string[],
): Promise<Map<string, WikiPage>> => {
  const pagesByTitle = new Map<string, WikiPage>();

  if (titles.length === 0) {
    return pagesByTitle;
  }

  for (const batch of chunkIntoBatches(titles, PAGE_TITLE_BATCH_SIZE)) {
    const data = await apiGet(
      {
        action: "query",
        titles: batch.join("|"),
        prop: "revisions|categories",
        rvprop: "content|ids",
        rvslots: "main",
        cllimit: "max",
      },
      titledPagesResponseSchema,
    );

    for (const page of data.query.pages) {
      const normalized = normalizePage(page);

      if (normalized) {
        pagesByTitle.set(normalized.title, normalized);
      }
    }
  }

  logEvent("wiki_fetch_titles_done", {
    requested: titles.length,
    found: pagesByTitle.size,
  });

  return pagesByTitle;
};

// Fetch only each page's latest revision id (no wikitext), keyed by page id.
// The daily ingest calls this first: comparing these ids against what is stored
// tells it whether anything changed before it loads the embedding model or
// fetches any content. generator=allpages + prop=info does it in one light
// paginated query over the whole content namespace.
export const fetchPageRevisions = async (): Promise<Map<number, number>> => {
  const revisions = new Map<number, number>();

  let continueParams: Record<string, string> | undefined;

  do {
    const data = await apiGet(
      {
        action: "query",
        generator: "allpages",
        gapnamespace: "0",
        gaplimit: "500",
        prop: "info",
        ...continueParams,
      },
      pageRevisionsResponseSchema,
    );

    for (const page of data.query.pages) {
      revisions.set(page.pageid, page.lastrevid);
    }

    continueParams = data.continue;

    logEvent("wiki_fetch_revisions_progress", { fetched: revisions.size });
  } while (continueParams);

  return revisions;
};

// Fetch the whole content-namespace corpus: every ns 0 page with its wikitext,
// latest revision id, and categories.
export const fetchWikiPages = async (): Promise<WikiPage[]> => {
  logEvent("wiki_fetch_start", { api: API_URL });

  const stubs = await fetchAllPageStubs();

  logEvent("wiki_fetch_allpages_done", { pageCount: stubs.length });

  const pages = await fetchPageContents(stubs);

  logEvent("wiki_fetch_done", { pageCount: pages.length });

  return pages;
};
