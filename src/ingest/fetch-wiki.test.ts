import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  chunkIntoBatches,
  fetchAllPageStubs,
  fetchPageContents,
  fetchPageRevisions,
  fetchPagesByTitles,
  fetchWikiPages,
  parseRetryAfterMs,
} from "@/ingest/fetch-wiki";

const API_URL = "https://wiki.concordlarp.com/api.php";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("parseRetryAfterMs", () => {
  it("reads a delay given in seconds", () => {
    expect(parseRetryAfterMs("5")).toBe(5000);
  });

  // The wiki sends Retry-After: 0. Pausing briefly is kinder than looping
  // straight back into a service that has just asked us to slow down.
  it("floors a zero delay at a second", () => {
    expect(parseRetryAfterMs("0")).toBe(1000);
  });

  it("caps an implausibly long delay", () => {
    expect(parseRetryAfterMs("99999")).toBe(30_000);
  });

  it("falls back to null when there is no usable header", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
    expect(parseRetryAfterMs("soon")).toBeNull();
  });

  it("accepts an HTTP date", () => {
    const soon = new Date(Date.now() + 4000).toUTCString();

    const parsed = parseRetryAfterMs(soon);

    expect(parsed).toBeGreaterThan(0);
    expect(parsed).toBeLessThanOrEqual(30_000);
  });
});

describe("fetchPagesByTitles", () => {
  it("retries a rate-limited request and succeeds", async () => {
    let attempts = 0;

    server.use(
      http.get(API_URL, () => {
        attempts += 1;

        if (attempts === 1) {
          return new HttpResponse("<html>Error 1015</html>", {
            status: 429,
            headers: { "retry-after": "1", server: "cloudflare" },
          });
        }

        return HttpResponse.json({
          query: {
            pages: [
              {
                pageid: 300,
                title: "War in Alpha",
                revisions: [{ revid: 7, slots: { main: { content: "body" } } }],
                categories: [],
              },
            ],
          },
        });
      }),
    );

    const pages = await fetchPagesByTitles(["War in Alpha"]);

    expect(attempts).toBe(2);
    expect(pages.get("War in Alpha")?.lastRevId).toBe(7);
  });
});

describe("chunkIntoBatches", () => {
  it("splits into fixed-size batches with a final remainder", () => {
    const items = [...Array(125).keys()];

    const batches = chunkIntoBatches(items, 50);

    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 25]);
  });

  it("returns no batches for an empty list", () => {
    expect(chunkIntoBatches([], 50)).toEqual([]);
  });
});

describe("fetchAllPageStubs", () => {
  it("follows continue tokens and merges every page", async () => {
    server.use(
      http.get(API_URL, ({ request }) => {
        const requestUrl = new URL(request.url);
        const apcontinue = requestUrl.searchParams.get("apcontinue");

        if (!apcontinue) {
          return HttpResponse.json({
            query: {
              allpages: [
                { pageid: 1, title: "Alpha" },
                { pageid: 2, title: "Beta" },
              ],
            },
            continue: { apcontinue: "Gamma", continue: "-||" },
          });
        }

        return HttpResponse.json({
          query: { allpages: [{ pageid: 3, title: "Gamma" }] },
        });
      }),
    );

    const stubs = await fetchAllPageStubs();

    expect(stubs).toEqual([
      { pageid: 1, title: "Alpha" },
      { pageid: 2, title: "Beta" },
      { pageid: 3, title: "Gamma" },
    ]);
  });
});

describe("fetchPageContents", () => {
  it("normalizes wikitext, revid, and category titles", async () => {
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json({
          query: {
            pages: [
              {
                pageid: 1,
                title: "Alpha",
                revisions: [
                  { revid: 42, slots: { main: { content: "hello world" } } },
                ],
                categories: [
                  { title: "Category:Rules" },
                  { title: "Category:Combat" },
                ],
              },
              {
                pageid: 2,
                title: "Empty",
              },
            ],
          },
        }),
      ),
    );

    const pages = await fetchPageContents([
      { pageid: 1, title: "Alpha" },
      { pageid: 2, title: "Empty" },
    ]);

    expect(pages).toEqual([
      {
        pageId: 1,
        title: "Alpha",
        wikitext: "hello world",
        lastRevId: 42,
        categories: ["Rules", "Combat"],
      },
      {
        pageId: 2,
        title: "Empty",
        wikitext: "",
        lastRevId: 0,
        categories: [],
      },
    ]);
  });

  it("batches page ids into groups of 50", async () => {
    const receivedBatchSizes: number[] = [];

    server.use(
      http.get(API_URL, ({ request }) => {
        const requestUrl = new URL(request.url);
        const pageIds = (requestUrl.searchParams.get("pageids") ?? "").split(
          "|",
        );

        receivedBatchSizes.push(pageIds.length);

        return HttpResponse.json({
          query: {
            pages: pageIds.map((pageId) => ({
              pageid: Number(pageId),
              title: `Page ${pageId}`,
              revisions: [{ revid: 1, slots: { main: { content: "x" } } }],
              categories: [],
            })),
          },
        });
      }),
    );

    const stubs = [...Array(120).keys()].map((index) => ({
      pageid: index + 1,
      title: `Page ${index + 1}`,
    }));

    const pages = await fetchPageContents(stubs);

    expect(receivedBatchSizes).toEqual([50, 50, 20]);
    expect(pages).toHaveLength(120);
  });
});

describe("fetchPageRevisions", () => {
  it("maps page id to latest revision id across continue tokens", async () => {
    server.use(
      http.get(API_URL, ({ request }) => {
        const requestUrl = new URL(request.url);
        const gapcontinue = requestUrl.searchParams.get("gapcontinue");

        if (!gapcontinue) {
          return HttpResponse.json({
            query: {
              pages: [
                { pageid: 1, title: "Alpha", lastrevid: 100 },
                { pageid: 2, title: "Beta", lastrevid: 200 },
              ],
            },
            continue: { gapcontinue: "Gamma", continue: "gapcontinue||" },
          });
        }

        return HttpResponse.json({
          query: {
            pages: [{ pageid: 3, title: "Gamma", lastrevid: 300 }],
          },
        });
      }),
    );

    const revisions = await fetchPageRevisions();

    expect(revisions).toEqual(
      new Map([
        [1, 100],
        [2, 200],
        [3, 300],
      ]),
    );
  });
});

describe("fetchWikiPages", () => {
  it("lists all pages then fetches their contents", async () => {
    server.use(
      http.get(API_URL, ({ request }) => {
        const requestUrl = new URL(request.url);

        if (requestUrl.searchParams.get("list") === "allpages") {
          return HttpResponse.json({
            query: {
              allpages: [
                { pageid: 10, title: "Iron Valley" },
                { pageid: 11, title: "Lerona Mere" },
              ],
            },
          });
        }

        const pageIds = (requestUrl.searchParams.get("pageids") ?? "").split(
          "|",
        );

        return HttpResponse.json({
          query: {
            pages: pageIds.map((pageId) => ({
              pageid: Number(pageId),
              title: `Page ${pageId}`,
              revisions: [
                { revid: Number(pageId) * 2, slots: { main: { content: "body" } } },
              ],
              categories: [{ title: "Category:Realms of the Concord" }],
            })),
          },
        });
      }),
    );

    const pages = await fetchWikiPages();

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ pageId: 10, lastRevId: 20, wikitext: "body" });
    expect(pages[0]?.categories).toEqual(["Realms of the Concord"]);
  });
});
