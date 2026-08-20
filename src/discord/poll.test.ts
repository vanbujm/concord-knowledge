import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { composeWindsDispatch } from "@/discord/compose";
import {
  countAnnouncements,
  loadSeenEntryTitles,
  recordAnnounced,
  recordSeenOnly,
} from "@/discord/dedup";
import { postChannelMessage } from "@/discord/discord-rest";
import { fetchSubPages, fetchWindsPages } from "@/discord/fetch-winds";
import { loadGuildInterests } from "@/discord/interests-store";
import { runPoll } from "@/discord/poll";
import type { WikiPage } from "@/ingest/fetch-wiki";
import { loadBackground } from "@/discord/background";

vi.mock("@/discord/fetch-winds", () => ({
  fetchWindsPages: vi.fn(),
  fetchSubPages: vi.fn(),
}));
vi.mock("@/discord/compose", () => ({ composeWindsDispatch: vi.fn() }));
vi.mock("@/discord/discord-rest", () => ({ postChannelMessage: vi.fn() }));
vi.mock("@/discord/dedup", () => ({
  countAnnouncements: vi.fn(),
  loadSeenEntryTitles: vi.fn(),
  recordSeenOnly: vi.fn(),
  recordAnnounced: vi.fn(),
}));
vi.mock("@/discord/interests-store", () => ({
  GENERAL_SCOPE: "general",
  loadGuildInterests: vi.fn(),
}));
// Avoid pulling the embedding model in through upsert.ts for a one-line helper.
vi.mock("@/ingest/upsert", () => ({
  sourceUrlForTitle: (title: string) =>
    `https://wiki.example/${encodeURIComponent(title)}`,
}));
// Retrieval reaches the database and the embedding model, neither of which a unit
// test should touch. Its own behaviour is covered in background.test.ts.
vi.mock("@/discord/background", () => ({ loadBackground: vi.fn() }));

const windsPage = (
  wikitext: string,
  title = "Winds of the World - Autumn 226",
): WikiPage => ({
  pageId: 1090,
  title,
  wikitext,
  lastRevId: 1,
  categories: [],
});

const TWO_ENTRIES = `
=== [[War in Alpha]] ===
* '''Lerona Mere'''
The drowned stir.

=== [[War in Beta]] ===
* '''Andash'''
Sand and ruins.
`;

const ONE_DROWNED = `
=== [[War in Alpha]] ===
* '''Lerona Mere'''
The drowned march on the region.
`;

const ONE_UNRELATED = `
=== [[Trade Talks]] ===
* '''The Exchange'''
Merchants haggle over grain.
`;

// A written sub-page for any title asked for. An entry whose sub-page is missing
// is treated as an unwritten placeholder, so "written" is the normal case here.
const writtenPages = (titles: string[]): Map<string, WikiPage> =>
  new Map(
    titles.map((title) => [
      title,
      {
        pageId: 2000,
        title,
        wikitext: `The body of ${title}.`,
        lastRevId: 1,
        categories: [],
      },
    ]),
  );

const EARLIER_SEASONS_RECORDED = 12;

describe("runPoll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DISCORD_GUILD_ID = "guild-1";
    process.env.DISCORD_CHANNEL_ID = "chan-1";
    process.env.DISCORD_BOT_TOKEN = "token";
    vi.mocked(countAnnouncements).mockResolvedValue(EARLIER_SEASONS_RECORDED);
    vi.mocked(loadBackground).mockResolvedValue([]);
    vi.mocked(fetchSubPages).mockImplementation(async (titles) =>
      writtenPages(titles),
    );
    vi.mocked(postChannelMessage).mockResolvedValue({ id: "msg" });
  });

  afterEach(() => {
    delete process.env.DISCORD_GUILD_ID;
    delete process.env.DISCORD_CHANNEL_ID;
    delete process.env.DISCORD_BOT_TOKEN;
  });

  it("baselines on a first-ever run without posting", async () => {
    vi.mocked(countAnnouncements).mockResolvedValue(0);
    vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(TWO_ENTRIES)]);
    vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());

    await runPoll({ backfill: false });

    expect(recordSeenOnly).toHaveBeenCalledTimes(2);
    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(loadGuildInterests).not.toHaveBeenCalled();
  });

  it("baselines only the entries that have been written", async () => {
    vi.mocked(countAnnouncements).mockResolvedValue(0);
    vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(TWO_ENTRIES)]);
    vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());
    vi.mocked(fetchSubPages).mockImplementation(async (titles) =>
      writtenPages(titles.filter((title) => title === "War in Alpha")),
    );

    await runPoll({ backfill: false });

    expect(recordSeenOnly).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordSeenOnly).mock.calls[0][0].entry.entryTitle).toBe(
      "War in Alpha",
    );
  });

  // The index page of a new season lists every entry title weeks before the
  // sub-pages are written. Baselining then would mark the whole season seen.
  it("does not baseline a new season once earlier seasons are recorded", async () => {
    vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(TWO_ENTRIES)]);
    vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());
    vi.mocked(loadGuildInterests).mockResolvedValue([
      { scope: "general", keyword: "drowned" },
    ]);
    vi.mocked(composeWindsDispatch).mockResolvedValue({
      persona: "diceria",
      relatedKeywords: ["drowned"],
      headline: "News",
      dispatch: "Caw.",
      reasons: [],
    });

    await runPoll({ backfill: false });

    expect(loadGuildInterests).toHaveBeenCalled();
    expect(postChannelMessage).toHaveBeenCalledTimes(2);
  });

  it("leaves an unwritten entry unrecorded so a later run can announce it", async () => {
    vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(TWO_ENTRIES)]);
    vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());
    vi.mocked(loadGuildInterests).mockResolvedValue([
      { scope: "general", keyword: "drowned" },
    ]);
    vi.mocked(fetchSubPages).mockResolvedValue(new Map());

    await runPoll({ backfill: false });

    expect(composeWindsDispatch).not.toHaveBeenCalled();
    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(recordSeenOnly).not.toHaveBeenCalled();
    expect(recordAnnounced).not.toHaveBeenCalled();
  });

  it("posts a relevant entry and @mentions the personal scope that matched", async () => {
    vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(ONE_DROWNED)]);
    vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set(["Already Seen"]));
    vi.mocked(loadGuildInterests).mockResolvedValue([
      { scope: "general", keyword: "the drowned" },
      { scope: "user-1", keyword: "stallia" },
    ]);
    vi.mocked(composeWindsDispatch).mockResolvedValue({
      persona: "diceria",
      relatedKeywords: ["the drowned", "stallia"],
      headline: "The tide turns",
      dispatch: "They march again.",
      reasons: [],
    });

    await runPoll({ backfill: false });

    expect(postChannelMessage).toHaveBeenCalledTimes(1);

    const postCall = vi.mocked(postChannelMessage).mock.calls[0][0];
    expect(postCall.mentionUserIds).toEqual(["user-1"]);
    expect(postCall.content).toContain("<@user-1>");
    expect(postCall.content).toContain("They march again.");

    expect(recordAnnounced).toHaveBeenCalledTimes(1);
    const recorded = vi.mocked(recordAnnounced).mock.calls[0][0];
    expect([...recorded.matchedScopes].sort()).toEqual(["general", "user-1"]);
    expect(recorded.persona).toBe("diceria");
  });

  describe("wiki background", () => {
    beforeEach(() => {
      vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(ONE_DROWNED)]);
      vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());
      vi.mocked(loadGuildInterests).mockResolvedValue([
        { scope: "general", keyword: "drowned" },
      ]);
      vi.mocked(composeWindsDispatch).mockResolvedValue({
        persona: "diceria",
        relatedKeywords: ["drowned"],
        headline: "News",
        dispatch: "Caw.",
        reasons: [],
      });
    });

    it("hands the retrieved excerpts to the composer", async () => {
      vi.mocked(loadBackground).mockResolvedValue([
        { title: "Lerona Mere", headingPath: "Regions", excerpt: "A city." },
      ]);

      await runPoll({ backfill: false });

      const composeCall = vi.mocked(composeWindsDispatch).mock.calls[0][0];
      expect(composeCall.background).toEqual([
        { title: "Lerona Mere", headingPath: "Regions", excerpt: "A city." },
      ]);
    });

    it("retrieves against the entry's sub-page text", async () => {
      await runPoll({ backfill: false });

      const backgroundCall = vi.mocked(loadBackground).mock.calls[0][0];
      expect(backgroundCall.subPageText).toBe("The body of War in Alpha.");
      expect(backgroundCall.windsTitle).toBe("Winds of the World - Autumn 226");
    });

    it("still posts when retrieval fails", async () => {
      vi.mocked(loadBackground).mockRejectedValue(new Error("pgvector down"));

      await runPoll({ backfill: false });

      expect(postChannelMessage).toHaveBeenCalledTimes(1);

      const composeCall = vi.mocked(composeWindsDispatch).mock.calls[0][0];
      expect(composeCall.background).toEqual([]);
    });
  });

  describe("dry run", () => {
    beforeEach(() => {
      vi.mocked(loadGuildInterests).mockResolvedValue([
        { scope: "general", keyword: "drowned" },
        { scope: "user-1", keyword: "drowned" },
      ]);
      vi.mocked(composeWindsDispatch).mockResolvedValue({
        persona: "diceria",
        relatedKeywords: ["drowned"],
        headline: "The tide turns",
        dispatch: "They march again.",
        reasons: [],
      });
    });

    it("posts nothing and writes nothing", async () => {
      vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(ONE_DROWNED)]);
      vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());

      await runPoll({ backfill: false, dryRun: true });

      expect(composeWindsDispatch).toHaveBeenCalledTimes(1);
      expect(postChannelMessage).not.toHaveBeenCalled();
      expect(recordAnnounced).not.toHaveBeenCalled();
      expect(recordSeenOnly).not.toHaveBeenCalled();
    });

    it("previews an entry that has already been announced", async () => {
      vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(ONE_DROWNED)]);
      vi.mocked(loadSeenEntryTitles).mockResolvedValue(
        new Set(["War in Alpha"]),
      );

      await runPoll({ backfill: false, dryRun: true });

      expect(composeWindsDispatch).toHaveBeenCalledTimes(1);
      expect(postChannelMessage).not.toHaveBeenCalled();
    });

    it("never baselines, even when nothing has been recorded", async () => {
      vi.mocked(countAnnouncements).mockResolvedValue(0);
      vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(TWO_ENTRIES)]);
      vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());

      await runPoll({ backfill: false, dryRun: true });

      expect(recordSeenOnly).not.toHaveBeenCalled();
    });

    it("composes only up to the limit", async () => {
      vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(TWO_ENTRIES)]);
      vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());

      await runPoll({ backfill: false, dryRun: true, limit: 1 });

      expect(composeWindsDispatch).toHaveBeenCalledTimes(1);
    });

    it("watches a named season instead of the newest", async () => {
      vi.mocked(fetchWindsPages).mockResolvedValue([
        windsPage(ONE_UNRELATED, "Winds of the World - Spring 226"),
        windsPage(ONE_DROWNED, "Winds of the World - Autumn 226"),
      ]);
      vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());

      await runPoll({ backfill: false, dryRun: true, season: "Autumn 226" });

      const composeCall = vi.mocked(composeWindsDispatch).mock.calls[0][0];
      expect(composeCall.entry.entryTitle).toBe("War in Alpha");
    });
  });

  it("records an unmatched entry as seen-only without posting", async () => {
    vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(ONE_UNRELATED)]);
    vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set(["Already Seen"]));
    vi.mocked(loadGuildInterests).mockResolvedValue([
      { scope: "general", keyword: "the drowned" },
    ]);
    vi.mocked(composeWindsDispatch).mockResolvedValue({
      persona: "ricordo",
      relatedKeywords: [],
      headline: "",
      dispatch: "",
      reasons: [],
    });

    await runPoll({ backfill: false });

    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(recordSeenOnly).toHaveBeenCalledTimes(1);
  });
});
