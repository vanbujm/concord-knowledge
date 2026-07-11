import { describe, expect, it } from "vitest";

import { deriveFacets } from "@/ingest/derive-facets";

describe("deriveFacets", () => {
  it("derives realm from title and folds the LeronaMere category", () => {
    expect(
      deriveFacets({ title: "Iron Valley History", categories: [], wikitext: "" })
        .realm,
    ).toBe("The Iron Valley");

    expect(
      deriveFacets({ title: "Some Page", categories: ["LeronaMere"], wikitext: "" })
        .realm,
    ).toBe("Lerona Mere");

    expect(
      deriveFacets({ title: "Rules Overview", categories: [], wikitext: "" }).realm,
    ).toBeNull();
  });

  it("derives sphere from title or category", () => {
    expect(
      deriveFacets({ title: "Panoply Ceremonies", categories: [], wikitext: "" })
        .sphere,
    ).toBe("Panoply");

    expect(
      deriveFacets({ title: "A Sect", categories: ["Stallia"], wikitext: "" }).sphere,
    ).toBe("Stallia");
  });

  it("classifies page types by naming convention", () => {
    const typeOf = (title: string, categories: string[] = [], wikitext = "") =>
      deriveFacets({ title, categories, wikitext }).pageType;

    expect(typeOf("Winds of the World - Summer 223")).toBe("newsletter");
    expect(typeOf("Historic Research - Winter 224")).toBe("history");
    expect(typeOf("Ash and Fire - The War in Windholme")).toBe("war-report");
    expect(typeOf("Iron Valley Tales of the People")).toBe("fiction");
    expect(typeOf("Combat Skills", ["Skills"])).toBe("rules");
    // Rules recognised by title even when the page has no categories.
    expect(typeOf("Magic Skills")).toBe("rules");
    expect(typeOf("The Iron Valley", [], "Communal mountainfolk.")).toBe("lore");
  });

  it("classifies blockquote-wrapped pages as fiction", () => {
    expect(
      deriveFacets({
        title: "A Poetic Story",
        categories: [],
        wikitext: "<blockquote>Once upon a time in Esterra.</blockquote>",
      }).pageType,
    ).toBe("fiction");
  });

  it("extracts, dedupes, and sorts seasons chronologically", () => {
    const facets = deriveFacets({
      title: "Winds of the World - Autumn 226",
      categories: [],
      wikitext:
        "It was Summer 223. Later, in Autumn 226, and again Autumn 226. Then Spring 225.",
    });

    expect(facets.seasons).toEqual(["Summer 223", "Spring 225", "Autumn 226"]);
  });
});
