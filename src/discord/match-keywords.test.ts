import { describe, expect, it } from "vitest";

import { matchKeywords } from "@/discord/match-keywords";

describe("matchKeywords", () => {
  it("matches on word boundaries, not substrings", () => {
    const matched = matchKeywords({
      text: "The war in Bolsterlee troubled the warden of the keep.",
      keywords: ["war", "warden", "peace"],
    });

    expect(matched).toEqual(["war", "warden"]);
  });

  it("does not match a keyword hidden inside a larger word", () => {
    const matched = matchKeywords({
      text: "The wardrobe was empty.",
      keywords: ["war"],
    });

    expect(matched).toEqual([]);
  });

  it("matches multi-word phrases as a whole", () => {
    const matched = matchKeywords({
      text: "Forces massed for an attack on Lerona Mere itself.",
      keywords: ["lerona mere", "lerona", "andash"],
    });

    expect(matched).toEqual(["lerona mere", "lerona"]);
  });

  it("is case-insensitive", () => {
    const matched = matchKeywords({
      text: "THE DROWNED rose from Vidania.",
      keywords: ["the drowned", "vidania"],
    });

    expect(matched).toEqual(["the drowned", "vidania"]);
  });

  it("ignores blank keywords", () => {
    expect(matchKeywords({ text: "anything", keywords: ["  "] })).toEqual([]);
  });
});
