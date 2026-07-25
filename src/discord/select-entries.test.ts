import { describe, expect, it } from "vitest";

import type { WindsEntry } from "@/discord/parse-winds";
import {
  selectLatestWinds,
  selectNewEntries,
  shouldBaseline,
} from "@/discord/select-entries";
import type { WikiPage } from "@/ingest/fetch-wiki";

const windsPage = (pageId: number, title: string): WikiPage => ({
  pageId,
  title,
  wikitext: "",
  lastRevId: 1,
  categories: [],
});

const entry = (entryTitle: string): WindsEntry => ({
  entryTitle,
  displayText: null,
  tagLine: null,
  affected: [],
  body: "",
});

describe("selectLatestWinds", () => {
  it("picks the newest seasonal page and ignores the index page", () => {
    const latest = selectLatestWinds([
      windsPage(1, "Winds of the World"),
      windsPage(2, "Winds of the World - Summer 224"),
      windsPage(3, "Winds of the World - Autumn 226"),
      windsPage(4, "Winds of the World - Spring 225"),
    ]);

    expect(latest?.title).toBe("Winds of the World - Autumn 226");
  });

  it("orders seasons within a year", () => {
    const latest = selectLatestWinds([
      windsPage(1, "Winds of the World - Spring 225"),
      windsPage(2, "Winds of the World - Autumn 225"),
    ]);

    expect(latest?.title).toBe("Winds of the World - Autumn 225");
  });

  it("returns null when no page is seasonal", () => {
    expect(selectLatestWinds([windsPage(1, "Winds of the World")])).toBeNull();
  });
});

describe("selectNewEntries", () => {
  it("keeps only entries not already seen", () => {
    const entries = [entry("Alpha"), entry("Beta"), entry("Gamma")];

    const fresh = selectNewEntries({
      entries,
      seenTitles: new Set(["Beta"]),
    });

    expect(fresh.map((item) => item.entryTitle)).toEqual(["Alpha", "Gamma"]);
  });
});

describe("shouldBaseline", () => {
  it("is true only when nothing has been recorded yet", () => {
    expect(shouldBaseline(0)).toBe(true);
    expect(shouldBaseline(3)).toBe(false);
  });
});
