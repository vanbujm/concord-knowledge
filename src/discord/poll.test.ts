import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { composeWindsDispatch } from "@/discord/compose";
import {
  loadSeenEntryTitles,
  recordAnnounced,
  recordSeenOnly,
} from "@/discord/dedup";
import { postChannelMessage } from "@/discord/discord-rest";
import { fetchSubPage, fetchWindsPages } from "@/discord/fetch-winds";
import { loadGuildInterests } from "@/discord/interests-store";
import { runPoll } from "@/discord/poll";
import type { WikiPage } from "@/ingest/fetch-wiki";

vi.mock("@/discord/fetch-winds", () => ({
  fetchWindsPages: vi.fn(),
  fetchSubPage: vi.fn(),
}));
vi.mock("@/discord/compose", () => ({ composeWindsDispatch: vi.fn() }));
vi.mock("@/discord/discord-rest", () => ({ postChannelMessage: vi.fn() }));
vi.mock("@/discord/dedup", () => ({
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

const windsPage = (wikitext: string): WikiPage => ({
  pageId: 1090,
  title: "Winds of the World - Autumn 226",
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

describe("runPoll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DISCORD_GUILD_ID = "guild-1";
    process.env.DISCORD_CHANNEL_ID = "chan-1";
    process.env.DISCORD_BOT_TOKEN = "token";
    vi.mocked(fetchSubPage).mockResolvedValue(null);
    vi.mocked(postChannelMessage).mockResolvedValue({ id: "msg" });
  });

  afterEach(() => {
    delete process.env.DISCORD_GUILD_ID;
    delete process.env.DISCORD_CHANNEL_ID;
    delete process.env.DISCORD_BOT_TOKEN;
  });

  it("baselines a first-seen page without posting", async () => {
    vi.mocked(fetchWindsPages).mockResolvedValue([windsPage(TWO_ENTRIES)]);
    vi.mocked(loadSeenEntryTitles).mockResolvedValue(new Set());

    await runPoll({ backfill: false });

    expect(recordSeenOnly).toHaveBeenCalledTimes(2);
    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(loadGuildInterests).not.toHaveBeenCalled();
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
