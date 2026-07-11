import { describe, expect, it } from "vitest";

import { countRevisionChanges } from "@/ingest/detect-changes";

describe("countRevisionChanges", () => {
  it("counts zero when the wiki and store match exactly", () => {
    const wiki = new Map([
      [1, 100],
      [2, 200],
    ]);
    const stored = new Map([
      [1, 100],
      [2, 200],
    ]);

    expect(countRevisionChanges({ wiki, stored })).toBe(0);
  });

  it("counts a page whose revision id moved on", () => {
    const wiki = new Map([
      [1, 101],
      [2, 200],
    ]);
    const stored = new Map([
      [1, 100],
      [2, 200],
    ]);

    expect(countRevisionChanges({ wiki, stored })).toBe(1);
  });

  it("counts a page that is new on the wiki", () => {
    const wiki = new Map([
      [1, 100],
      [2, 200],
    ]);
    const stored = new Map([[1, 100]]);

    expect(countRevisionChanges({ wiki, stored })).toBe(1);
  });

  it("counts a page that was removed from the wiki", () => {
    const wiki = new Map([[1, 100]]);
    const stored = new Map([
      [1, 100],
      [2, 200],
    ]);

    expect(countRevisionChanges({ wiki, stored })).toBe(1);
  });

  it("sums new, changed, and removed pages together", () => {
    const wiki = new Map([
      [1, 101],
      [3, 300],
    ]);
    const stored = new Map([
      [1, 100],
      [2, 200],
    ]);

    expect(countRevisionChanges({ wiki, stored })).toBe(3);
  });
});
