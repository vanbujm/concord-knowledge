import { describe, expect, it } from "vitest";

import { buildExcerpt, queryTerms } from "@/retrieval/excerpt";

describe("queryTerms", () => {
  it("lowercases, dedupes, and drops one-character noise", () => {
    expect(queryTerms("The Iron VALLEY a iron")).toEqual([
      "the",
      "iron",
      "valley",
    ]);
  });
});

describe("buildExcerpt", () => {
  it("returns the whole text when it fits, with term highlights", () => {
    const excerpt = buildExcerpt({
      text: "The Valleyfolk stand together.",
      terms: ["valleyfolk"],
      maxChars: 320,
    });

    expect(excerpt.text).toBe("The Valleyfolk stand together.");
    expect(excerpt.highlights).toEqual([{ start: 4, end: 14 }]);
  });

  it("windows a long text around the first match and adds ellipses", () => {
    const text = `${"lorem ipsum dolor ".repeat(30)}the Deathless skill ${"trailing words ".repeat(30)}`;

    const excerpt = buildExcerpt({ text, terms: ["deathless"], maxChars: 120 });

    expect(excerpt.text.length).toBeLessThanOrEqual(122);
    expect(excerpt.text).toContain("Deathless");
    expect(excerpt.text.startsWith("…")).toBe(true);
    expect(excerpt.text.endsWith("…")).toBe(true);
    expect(excerpt.highlights.length).toBeGreaterThan(0);
  });

  it("falls back to the start of the text when no term matches", () => {
    const text = "a".repeat(500);

    const excerpt = buildExcerpt({ text, terms: ["missing"], maxChars: 100 });

    expect(excerpt.text.endsWith("…")).toBe(true);
    expect(excerpt.text.startsWith("…")).toBe(false);
    expect(excerpt.highlights).toEqual([]);
  });

  it("highlights whole words only, not substrings", () => {
    const excerpt = buildExcerpt({
      text: "A warrior fought in the war.",
      terms: ["war"],
      maxChars: 320,
    });

    expect(excerpt.highlights).toEqual([{ start: 24, end: 27 }]);
  });
});
