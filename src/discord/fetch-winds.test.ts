import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { fetchSubPage, fetchWindsPages } from "@/discord/fetch-winds";

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

describe("fetchSubPage", () => {
  it("returns the exact-title match, ignoring longer neighbours", async () => {
    server.use(
      http.get(API_URL, ({ request }) => {
        const params = new URL(request.url).searchParams;

        if (params.get("list") === "allpages") {
          return HttpResponse.json({
            query: {
              allpages: [
                { pageid: 200, title: "War in Alpha" },
                { pageid: 201, title: "War in Alpha (Extended Cut)" },
              ],
            },
          });
        }

        const pageIds = (params.get("pageids") ?? "").split("|");
        const titles: Record<string, string> = {
          "200": "War in Alpha",
          "201": "War in Alpha (Extended Cut)",
        };

        return HttpResponse.json({
          query: {
            pages: pageIds.map((pageId) => ({
              pageid: Number(pageId),
              title: titles[pageId],
              revisions: [{ revid: 1, slots: { main: { content: "body" } } }],
              categories: [],
            })),
          },
        });
      }),
    );

    const page = await fetchSubPage("War in Alpha");

    expect(page?.pageId).toBe(200);
    expect(page?.title).toBe("War in Alpha");
  });

  it("returns null when the exact title is absent", async () => {
    server.use(
      http.get(API_URL, ({ request }) => {
        const params = new URL(request.url).searchParams;

        if (params.get("list") === "allpages") {
          return HttpResponse.json({ query: { allpages: [] } });
        }

        return HttpResponse.json({ query: { pages: [] } });
      }),
    );

    expect(await fetchSubPage("Nonexistent Page")).toBeNull();
  });
});
