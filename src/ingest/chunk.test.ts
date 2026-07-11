import { describe, expect, it } from "vitest";

import { chunkPage } from "@/ingest/chunk";

const paragraphIndices = (chunkText: string): number[] =>
  [...chunkText.matchAll(/Paragraph (\d+):/g)].map((match) => Number(match[1]));

describe("chunkPage", () => {
  it("returns a single chunk for a short page", () => {
    const chunks = chunkPage("A short page about the Iron Valley.");

    expect(chunks).toHaveLength(1);
    expect(chunks[0].headingPath).toBe("");
    expect(chunks[0].text).toBe("A short page about the Iron Valley.");
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  it("splits a large page by heading and records the heading path", () => {
    const body = "The war raged on across the valley. ".repeat(50);
    const page = `Intro paragraph.\n\n== History ==\n\n${body}\n\n== Aftermath ==\n\n${body}`;

    const chunks = chunkPage(page);
    const paths = chunks.map((chunk) => chunk.headingPath);

    expect(paths).toContain("");
    expect(paths).toContain("History");
    expect(paths).toContain("Aftermath");
  });

  it("splits an oversized section into overlapping windows", () => {
    const paragraphs = [...Array(40).keys()].map(
      (index) =>
        `Paragraph ${index}: the Valleyfolk stand together against the encroaching dark and tell their legends by firelight.`,
    );
    const page = `== Legends ==\n\n${paragraphs.join("\n\n")}`;

    const chunks = chunkPage(page);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.headingPath === "Legends")).toBe(true);

    const firstIndices = paragraphIndices(chunks[0].text);
    const secondIndices = paragraphIndices(chunks[1].text);
    const shared = secondIndices.some((index) => firstIndices.includes(index));

    expect(shared).toBe(true);
  });

  it("never splits a rendered table across chunks", () => {
    const filler = "The valley endures through every season and every storm. ".repeat(
      30,
    );
    const tableRows = [...Array(60).keys()]
      .map((index) => `Skill ${index}: costs ${index} points and grants power ${index}.`)
      .join("\n");
    const page = `== Skills ==\n\n${filler}\n\n${tableRows}\n\n${filler}`;

    const chunks = chunkPage(page);
    const tableChunk = chunks.find((chunk) => chunk.text.includes("Skill 0:"));

    expect(tableChunk).toBeDefined();
    expect(tableChunk?.text).toContain("Skill 0:");
    expect(tableChunk?.text).toContain("Skill 59:");
  });
});
