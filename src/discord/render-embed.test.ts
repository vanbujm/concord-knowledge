import { describe, expect, it } from "vitest";

import type { Persona } from "@/discord/personas";
import { buildSearchEmbed, buildWindsEmbed } from "@/discord/render-embed";

const persona: Persona = {
  key: "diceria",
  name: "Diceria",
  avatarUrl: "https://example.test/diceria.png",
  color: 0x8a1c1c,
  voiceBrief: "test",
};

describe("buildWindsEmbed", () => {
  it("attributes the embed to the raven and links the title", () => {
    const embed = buildWindsEmbed({
      persona,
      title: "The War Against the Drowned",
      url: "https://wiki.example/War",
      dispatch: "They stir again in the south.",
      matchedKeywords: ["the drowned", "lerona mere"],
      affected: ["Lerona Mere", "The War Chamber"],
    });

    expect(embed.author).toEqual({
      name: "Diceria",
      icon_url: "https://example.test/diceria.png",
    });
    expect(embed.title).toBe("The War Against the Drowned");
    expect(embed.url).toBe("https://wiki.example/War");
    expect(embed.description).toBe("They stir again in the south.");
    expect(embed.color).toBe(0x8a1c1c);
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
      dispatch: "Nothing to report.",
      matchedKeywords: [],
      affected: [],
    });

    expect(embed.fields).toBeUndefined();
  });

  it("truncates an over-long title and description to Discord limits", () => {
    const embed = buildWindsEmbed({
      persona,
      title: "T".repeat(300),
      url: "https://wiki.example/Long",
      dispatch: "D".repeat(5000),
      matchedKeywords: [],
      affected: [],
    });

    expect(embed.title?.length).toBe(256);
    expect(embed.title?.endsWith("…")).toBe(true);
    expect(embed.description?.length).toBe(4096);
    expect(embed.description?.endsWith("…")).toBe(true);
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
