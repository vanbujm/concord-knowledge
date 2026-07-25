import { describe, expect, it } from "vitest";

import type { Persona } from "@/discord/personas";
import {
  buildSearchEmbed,
  buildWindsContent,
  buildWindsEmbed,
} from "@/discord/render-embed";

const persona: Persona = {
  key: "diceria",
  name: "Diceria",
  avatarUrl: "https://example.test/diceria.png",
  color: 0x8a1c1c,
  voiceBrief: "test",
};

describe("buildWindsContent", () => {
  it("puts mentions and the dispatch in the message content", () => {
    const content = buildWindsContent({
      dispatch: "They stir again in the south.",
      mentionUserIds: ["u1", "u2"],
    });

    expect(content).toBe("<@u1> <@u2>\nThey stir again in the south.");
  });

  it("omits the mention line when nobody is tagged", () => {
    const content = buildWindsContent({
      dispatch: "A general concern.",
      mentionUserIds: [],
    });

    expect(content).toBe("A general concern.");
  });

  it("truncates over-long content to Discord's 2000-char limit", () => {
    const content = buildWindsContent({
      dispatch: "D".repeat(2500),
      mentionUserIds: [],
    });

    expect(content.length).toBe(2000);
    expect(content.endsWith("…")).toBe(true);
  });
});

describe("buildWindsEmbed", () => {
  it("attributes the card to the raven, links the title, and lists the tags", () => {
    const embed = buildWindsEmbed({
      persona,
      title: "The War Against the Drowned",
      url: "https://wiki.example/War",
      matchedKeywords: ["the drowned", "lerona mere"],
      affected: ["Lerona Mere", "The War Chamber"],
    });

    expect(embed.author).toEqual({
      name: "Diceria",
      icon_url: "https://example.test/diceria.png",
    });
    expect(embed.title).toBe("The War Against the Drowned");
    expect(embed.url).toBe("https://wiki.example/War");
    expect(embed.color).toBe(0x8a1c1c);
    expect(embed.description).toBeUndefined();
    expect(embed.fields?.[0]).toEqual({
      name: "Of interest",
      value: "the drowned, lerona mere",
    });
  });

  it("omits fields when there is nothing to show", () => {
    const embed = buildWindsEmbed({
      persona,
      title: "Quiet",
      url: "https://wiki.example/Quiet",
      matchedKeywords: [],
      affected: [],
    });

    expect(embed.fields).toBeUndefined();
  });

  it("truncates an over-long title to Discord's limit", () => {
    const embed = buildWindsEmbed({
      persona,
      title: "T".repeat(300),
      url: "https://wiki.example/Long",
      matchedKeywords: [],
      affected: [],
    });

    expect(embed.title?.length).toBe(256);
    expect(embed.title?.endsWith("…")).toBe(true);
  });
});

describe("buildSearchEmbed", () => {
  it("renders results as markdown links under the intro", () => {
    const embed = buildSearchEmbed({
      persona,
      query: "stallia",
      intro: "The archive stirs.",
      results: [
        {
          title: "Stallia",
          sourceUrl: "https://wiki.example/Stallia",
          section: "Overview",
          excerpt: "The dark sphere of stars.",
        },
      ],
    });

    expect(embed.title).toBe("Search: stallia");
    expect(embed.description).toContain("The archive stirs.");
    expect(embed.description).toContain(
      "**[Stallia](https://wiki.example/Stallia)** — Overview",
    );
    expect(embed.description).toContain("The dark sphere of stars.");
  });

  it("notes when nothing was found", () => {
    const embed = buildSearchEmbed({
      persona,
      query: "nonexistent",
      intro: "Hm.",
      results: [],
    });

    expect(embed.description).toContain("Nothing in the archive");
  });
});
