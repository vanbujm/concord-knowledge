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

describe("selectLatestWinds season order", () => {
  it("ranks Spring after Autumn within a year, as Concord numbers them", () => {
    const latest = selectLatestWinds([
      windsPage(1, "Winds of the World - Autumn 226"),
      windsPage(2, "Winds of the World - Spring 226"),
    ]);

    expect(latest?.title).toBe("Winds of the World - Spring 226");
  });

  it("ranks Summer after Winter in the older naming", () => {
    const latest = selectLatestWinds([
      windsPage(1, "Winds of the World - Summer 224"),
      windsPage(2, "Winds of the World - Winter 224"),
    ]);

    expect(latest?.title).toBe("Winds of the World - Summer 224");
  });

  it("orders the whole run the way the wiki index lists it", () => {
    const titles = [
      "Winds of the World - Summer 224",
      "Winds of the World - Spring 226",
      "Winds of the World - Autumn 225",
      "Winds of the World - Winter 224",
      "Winds of the World - Spring 225",
      "Winds of the World - Autumn 226",
    ];

    // Selecting from progressively longer prefixes must never step backwards.
    const latestOfAll = selectLatestWinds(
      titles.map((title, index) => windsPage(index, title)),
    );

    expect(latestOfAll?.title).toBe("Winds of the World - Spring 226");
  });
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

  // The wiki's index lists Autumn 225 before Spring 225, the same way it lists
  // Autumn 226 before Spring 226, so Spring is the later of the two.
  it("orders seasons within a year", () => {
    const latest = selectLatestWinds([
      windsPage(1, "Winds of the World - Spring 225"),
      windsPage(2, "Winds of the World - Autumn 225"),
    ]);

    expect(latest?.title).toBe("Winds of the World - Spring 225");
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
  it("is true only on a first-ever run, across every season", () => {
    expect(shouldBaseline(0)).toBe(true);
    expect(shouldBaseline(3)).toBe(false);
  });
});
