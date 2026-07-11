import { describe, expect, it } from "vitest";

import {
  computeContentHash,
  pageNeedsReindex,
  sourceUrlForTitle,
} from "@/ingest/upsert";

describe("computeContentHash", () => {
  it("is deterministic and content-sensitive", () => {
    expect(computeContentHash("hello")).toBe(computeContentHash("hello"));
    expect(computeContentHash("hello")).not.toBe(computeContentHash("world"));
  });
});

describe("sourceUrlForTitle", () => {
  it("builds a canonical wiki URL with underscores", () => {
    expect(sourceUrlForTitle("The Iron Valley")).toBe(
      "https://wiki.concordlarp.com/index.php?title=The_Iron_Valley",
    );
  });
});

describe("pageNeedsReindex", () => {
  const page = { wikitext: "body", lastRevId: 42 };

  it("re-indexes a page with no stored state", () => {
    expect(pageNeedsReindex({ page, stored: undefined })).toBe(true);
  });

  it("skips a page whose revision and hash are unchanged", () => {
    const stored = {
      lastRevId: 42,
      contentHash: computeContentHash("body"),
    };

    expect(pageNeedsReindex({ page, stored })).toBe(false);
  });

  it("re-indexes when the revision id changed", () => {
    const stored = {
      lastRevId: 41,
      contentHash: computeContentHash("body"),
    };

    expect(pageNeedsReindex({ page, stored })).toBe(true);
  });

  it("re-indexes when the content hash changed", () => {
    const stored = { lastRevId: 42, contentHash: computeContentHash("old") };

    expect(pageNeedsReindex({ page, stored })).toBe(true);
  });
});
