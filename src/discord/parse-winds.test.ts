import { describe, expect, it } from "vitest";

import { parseWindsEntries } from "@/discord/parse-winds";

const SAMPLE = `Intro prose that belongs to no entry.

=== [[It Was Not Meant - The War in Bolsterlee|The War Against the Drowned]] ===

* '''The War Chamber / The Iron Valley / Lerona Mere'''
The Drowned push north, intent on retaking Mandrianos.

=== [[On the Edge of My Last Concern]] ===

* '''The Shardcircle'''
A council so quiet you cannot enter without a certain spell.

=== [[A Quiet Note]] ===
No tag line here, only prose.

=== Further Reading ===

* [[Winds of the World|Winds of the World Main Page]]
`;

describe("parseWindsEntries", () => {
  it("extracts only the link headings, in order", () => {
    const entries = parseWindsEntries(SAMPLE);

    expect(entries.map((entry) => entry.entryTitle)).toEqual([
      "It Was Not Meant - The War in Bolsterlee",
      "On the Edge of My Last Concern",
      "A Quiet Note",
    ]);
  });

  it("captures piped display text, tag line, and affected parties", () => {
    const [first] = parseWindsEntries(SAMPLE);

    expect(first.displayText).toBe("The War Against the Drowned");
    expect(first.tagLine).toBe("The War Chamber / The Iron Valley / Lerona Mere");
    expect(first.affected).toEqual([
      "The War Chamber",
      "The Iron Valley",
      "Lerona Mere",
    ]);
    expect(first.body).toContain("push north");
  });

  it("leaves display text null for an unpiped link", () => {
    const second = parseWindsEntries(SAMPLE)[1];

    expect(second.entryTitle).toBe("On the Edge of My Last Concern");
    expect(second.displayText).toBeNull();
  });

  it("tolerates an entry with no tag line", () => {
    const quiet = parseWindsEntries(SAMPLE).find(
      (entry) => entry.entryTitle === "A Quiet Note",
    );

    expect(quiet?.tagLine).toBeNull();
    expect(quiet?.affected).toEqual([]);
    expect(quiet?.body).toContain("only prose");
  });

  it("ignores non-link headings such as Further Reading", () => {
    const entries = parseWindsEntries(SAMPLE);

    expect(
      entries.some((entry) => entry.entryTitle.includes("Further Reading")),
    ).toBe(false);
  });
});
