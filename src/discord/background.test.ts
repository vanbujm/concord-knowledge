import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadBackground, mentionedTitles } from "@/discord/background";
import type { WindsEntry } from "@/discord/parse-winds";
import { runHybridSearch } from "@/retrieval/hybrid-search";

vi.mock("@/retrieval/hybrid-search", () => ({ runHybridSearch: vi.fn() }));
vi.mock("@/db/client", () => ({
  prisma: { document: { findMany: vi.fn() } },
}));

const { prisma } = await import("@/db/client");

const entry = (affected: string[] = ["Andash"]): WindsEntry => ({
  entryTitle: "Hostile Takeover - The War in Mukarrem",
  displayText: null,
  tagLine: null,
  affected,
  body: "",
});

const searchResult = (title: string, headingPath = "") => ({
  chunkId: `chunk-${title}-${headingPath}`,
  title,
  headingPath,
  excerpt: `About ${title}.`,
  highlights: [],
  sourceUrl: `https://wiki.example/${encodeURIComponent(title)}`,
  categories: [],
  realm: null,
  sphere: null,
  seasons: [],
  score: 1,
});

const knownTitles = (titles: string[]) => {
  const rows = titles.map((title) => ({ title }));

  // Cast: the call under test passes a select so it yields titles alone, while the
  // generated Prisma type describes a whole Document row.
  vi.mocked(prisma.document.findMany).mockResolvedValue(rows as never);
};

describe("mentionedTitles", () => {
  it("finds the corpus titles that appear in the text", () => {
    const found = mentionedTitles({
      text: "The Artebazzani seized Torrealuz along the Salt Road.",
      knownTitles: ["Artebazzani", "Salt Road", "Vidania"],
    });

    expect(found).toContain("Artebazzani");
    expect(found).toContain("Salt Road");
    expect(found).not.toContain("Vidania");
  });

  it("returns the most specific titles first", () => {
    const found = mentionedTitles({
      text: "The Trade Principality fights in Mukarrem.",
      knownTitles: ["Mukarrem", "Trade Principality"],
    });

    expect(found).toEqual(["Trade Principality", "Mukarrem"]);
  });

  // The floor has to stay low enough to keep real names like "Andash", which is
  // six characters, so six-character common words such as "Combat" still slip
  // through. Ordering by length and capping the query is what keeps them out of
  // the way in practice.
  it("ignores short titles that are ordinary words", () => {
    expect(
      mentionedTitles({
        text: "The army sailed with the fleet.",
        knownTitles: ["Army", "Fleet"],
      }),
    ).toEqual([]);
  });

  it("keeps a real six-character realm name", () => {
    expect(
      mentionedTitles({
        text: "Envoys rode for Andash.",
        knownTitles: ["Andash"],
      }),
    ).toEqual(["Andash"]);
  });

  it("ignores other Winds pages", () => {
    expect(
      mentionedTitles({
        text: "See Winds of the World - Summer 223 for the earlier war.",
        knownTitles: ["Winds of the World - Summer 223"],
      }),
    ).toEqual([]);
  });

  it("matches on whole words only", () => {
    expect(
      mentionedTitles({
        text: "The Andashi envoy arrived.",
        knownTitles: ["Andash"],
      }),
    ).toEqual([]);
  });
});

describe("loadBackground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    knownTitles([]);
    vi.mocked(runHybridSearch).mockResolvedValue([]);
  });

  it("queries the detected entities before the affected parties", async () => {
    knownTitles(["Mukarrem", "Artebazzani"]);

    await loadBackground({
      entry: entry(["Andash"]),
      windsTitle: "Winds of the World - Autumn 226",
      subPageText: "The Artebazzani struck deep into Mukarrem.",
    });

    const queries = vi
      .mocked(runHybridSearch)
      .mock.calls.map((call) => call[0].query);

    expect(queries).toEqual(["Artebazzani Mukarrem", "Andash"]);
  });

  it("falls back to the affected parties when no entity is recognised", async () => {
    await loadBackground({
      entry: entry(["Andash"]),
      windsTitle: "Winds of the World - Autumn 226",
      subPageText: "Nothing here matches the corpus.",
    });

    const queries = vi
      .mocked(runHybridSearch)
      .mock.calls.map((call) => call[0].query);

    expect(queries).toEqual(["Andash"]);
  });

  it("drops the Winds page and the entry's own sub-page", async () => {
    vi.mocked(runHybridSearch).mockResolvedValue([
      searchResult("Winds of the World - Autumn 226"),
      searchResult("Hostile Takeover - The War in Mukarrem"),
      searchResult("Andash"),
    ]);

    const notes = await loadBackground({
      entry: entry(),
      windsTitle: "Winds of the World - Autumn 226",
      subPageText: "",
    });

    expect(notes.map((note) => note.title)).toEqual(["Andash"]);
  });

  it("keeps one excerpt per page", async () => {
    vi.mocked(runHybridSearch).mockResolvedValue([
      searchResult("Andash", "History"),
      searchResult("Andash", "Culture"),
      searchResult("The Foreign Service"),
    ]);

    const notes = await loadBackground({
      entry: entry(),
      windsTitle: "Winds of the World - Autumn 226",
      subPageText: "",
    });

    expect(notes.map((note) => note.title)).toEqual([
      "Andash",
      "The Foreign Service",
    ]);
    expect(notes[0].headingPath).toBe("History");
  });

  it("returns at most five notes", async () => {
    vi.mocked(runHybridSearch).mockResolvedValue(
      ["one", "two", "three", "four", "five", "six", "seven"].map((title) =>
        searchResult(title),
      ),
    );

    const notes = await loadBackground({
      entry: entry(),
      windsTitle: "Winds of the World - Autumn 226",
      subPageText: "",
    });

    expect(notes).toHaveLength(5);
  });
});
