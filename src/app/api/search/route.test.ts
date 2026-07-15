import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "@/rate-limit";
import { warmEmbeddingModel } from "@/retrieval/embedding";
import { runHybridSearch, type SearchResult } from "@/retrieval/hybrid-search";
import { GET } from "@/app/api/search/route";

vi.mock("@/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  clientIdentifier: vi.fn(() => "test-ip"),
}));

vi.mock("@/retrieval/embedding", () => ({
  warmEmbeddingModel: vi.fn(),
}));

vi.mock("@/retrieval/hybrid-search", () => ({
  runHybridSearch: vi.fn(),
}));

const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedWarmEmbeddingModel = vi.mocked(warmEmbeddingModel);
const mockedRunHybridSearch = vi.mocked(runHybridSearch);

const sampleResult: SearchResult = {
  chunkId: "chunk-1",
  title: "The Iron Valley",
  headingPath: "History > The Siege",
  excerpt: "The Iron Valley stood together against the siege.",
  highlights: [{ start: 4, end: 9 }],
  sourceUrl: "https://wiki.concordlarp.com/The_Iron_Valley",
  categories: ["Realms of the Concord"],
  realm: "The Iron Valley",
  sphere: null,
  seasons: ["Winter 226"],
  score: 0.5,
};

const request = (search: string): Request =>
  new Request(`http://localhost/api/search${search}`);

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockResolvedValue(true);
    mockedWarmEmbeddingModel.mockResolvedValue();
    mockedRunHybridSearch.mockResolvedValue([]);
  });

  it("warms the model without searching, rate-limiting, or needing a query", async () => {
    const response = await GET(request("?warm=1"));
    const body: { warmed: boolean } = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ warmed: true });
    expect(mockedWarmEmbeddingModel).toHaveBeenCalledTimes(1);
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
    expect(mockedRunHybridSearch).not.toHaveBeenCalled();
  });

  it("rejects a missing query with 400 and never searches", async () => {
    const response = await GET(request(""));

    expect(response.status).toBe(400);
    expect(mockedRunHybridSearch).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    mockedCheckRateLimit.mockResolvedValue(false);

    const response = await GET(request("?q=iron"));

    expect(response.status).toBe(429);
    expect(mockedRunHybridSearch).not.toHaveBeenCalled();
  });

  it("returns the results array for a valid query", async () => {
    mockedRunHybridSearch.mockResolvedValue([sampleResult]);

    const response = await GET(request("?q=iron"));
    const body: SearchResult[] = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].sourceUrl).toBe(sampleResult.sourceUrl);
  });

  it("passes facet filters through to the retrieval core", async () => {
    await GET(request("?q=iron&realm=Andash&season=Winter+226"));

    expect(mockedRunHybridSearch).toHaveBeenCalledWith({
      query: "iron",
      filters: {
        realms: ["Andash"],
        spheres: undefined,
        categories: undefined,
        seasons: ["Winter 226"],
      },
      limit: undefined,
    });
  });

  it("collects repeated facet params into one selection per facet", async () => {
    await GET(request("?q=iron&category=Ceremonies&category=Uncategorised"));

    expect(mockedRunHybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          categories: ["Ceremonies", "Uncategorised"],
        }),
      }),
    );
  });

  it("treats a blank facet value as no filter", async () => {
    await GET(request("?q=iron&realm="));

    expect(mockedRunHybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ realms: undefined }),
      }),
    );
  });
});
