import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { fetchSubPages, fetchWindsPages } from "@/discord/fetch-winds";

const API_URL = "https://wiki.concordlarp.com/api.php";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const contentsFor = (pageIds: string[]) => ({
  query: {
    pages: pageIds.map((pageId) => ({
      pageid: Number(pageId),
      title: `Page ${pageId}`,
      revisions: [{ revid: 1, slots: { main: { content: "body" } } }],
      categories: [],
    })),
  },
});

describe("fetchWindsPages", () => {
  it("lists Winds pages by prefix then fetches their contents", async () => {
    server.use(
      http.get(API_URL, ({ request }) => {
        const params = new URL(request.url).searchParams;

        if (params.get("list") === "allpages") {
          expect(params.get("apprefix")).toBe("Winds of the World");

          return HttpResponse.json({
            query: {
              allpages: [
                { pageid: 100, title: "Winds of the World" },
                { pageid: 101, title: "Winds of the World - Autumn 226" },
              ],
            },
          });
        }

        return HttpResponse.json(
          contentsFor((params.get("pageids") ?? "").split("|")),
        );
      }),
    );

    const pages = await fetchWindsPages();

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.pageId).sort()).toEqual([100, 101]);
  });
});

describe("fetchSubPages", () => {
  // The whole point of the batched fetch: one request for every title, not one
  // request per title, which is what drew rate limiting.
  it("asks for every title in a single request", async () => {
    let requestCount = 0;

    server.use(
      http.get(API_URL, ({ request }) => {
        requestCount += 1;

        const requested = (
          new URL(request.url).searchParams.get("titles") ?? ""
        ).split("|");

        return HttpResponse.json({
          query: {
            pages: requested.map((title, index) => ({
              pageid: 200 + index,
              title,
              revisions: [{ revid: 1, slots: { main: { content: "body" } } }],
              categories: [],
            })),
          },
        });
      }),
    );

    const pages = await fetchSubPages(["War in Alpha", "War in Beta"]);

    expect(requestCount).toBe(1);
    expect([...pages.keys()].sort()).toEqual(["War in Alpha", "War in Beta"]);
    expect(pages.get("War in Alpha")?.pageId).toBe(200);
  });

  it("omits titles the wiki does not have", async () => {
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json({
          query: {
            pages: [
              {
                pageid: 200,
                title: "War in Alpha",
                revisions: [
                  { revid: 1, slots: { main: { content: "body" } } },
                ],
                categories: [],
              },
              // How the wiki reports a title it has never had.
              { title: "Not Written Yet", missing: true },
            ],
          },
        }),
      ),
    );

    const pages = await fetchSubPages(["War in Alpha", "Not Written Yet"]);

    expect([...pages.keys()]).toEqual(["War in Alpha"]);
    expect(pages.has("Not Written Yet")).toBe(false);
  });

  it("sends no request at all for an empty title list", async () => {
    expect((await fetchSubPages([])).size).toBe(0);
  });
});
