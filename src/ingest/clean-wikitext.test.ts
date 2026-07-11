import { describe, expect, it } from "vitest";

import { cleanWikitext } from "@/ingest/clean-wikitext";

describe("cleanWikitext", () => {
  it("removes templates including media embeds", () => {
    expect(cleanWikitext("before {{#ev:soundcloud|https://x}} after")).toBe(
      "before after",
    );
    expect(cleanWikitext("{{DISPLAYTITLE:X}}Body")).toBe("Body");
  });

  it("removes File and Category links", () => {
    expect(cleanWikitext("[[File:Banner.png|thumb|caption]]Hello")).toBe(
      "Hello",
    );
    expect(cleanWikitext("Text [[Category:Rules]]")).toBe("Text");
  });

  it("unwraps internal links", () => {
    expect(cleanWikitext("See [[All Skills|the skills page]] now")).toBe(
      "See the skills page now",
    );
    expect(cleanWikitext("Visit [[Windholme]] often")).toBe("Visit Windholme often");
  });

  it("normalizes curly quotes and dashes", () => {
    expect(cleanWikitext("the character’s bleed—out time")).toBe(
      "the character's bleed-out time",
    );
  });

  it("strips bold and italic markers", () => {
    expect(cleanWikitext("this is '''bold''' and ''italic''")).toBe(
      "this is bold and italic",
    );
  });

  it("renders a wikitable into header-paired lines with costs intact", () => {
    const table = [
      '{| class="wikitable"',
      "!'''Name'''",
      "!Cost",
      "|-",
      "|Juggernaut",
      "|2/4/6/8",
      "|-",
      "|Armoured",
      "|2",
      "|}",
    ].join("\n");

    const cleaned = cleanWikitext(table);

    expect(cleaned).toContain("Name: Juggernaut. Cost: 2/4/6/8");
    expect(cleaned).toContain("Name: Armoured. Cost: 2");
  });

  it("keeps section headings so the chunker can split on them", () => {
    const cleaned = cleanWikitext("Intro\n\n== History ==\n\nThe war began.");

    expect(cleaned).toContain("== History ==");
  });

  it("keeps blockquote text and drops the tags", () => {
    expect(
      cleanWikitext("<blockquote>Eadwyn fought bravely.</blockquote>"),
    ).toBe("Eadwyn fought bravely.");
  });
});
