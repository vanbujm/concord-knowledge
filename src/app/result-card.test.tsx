import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SearchResult } from "@/retrieval/hybrid-search";

import { ResultCard } from "./result-card";

const baseResult: SearchResult = {
  chunkId: "chunk-1",
  title: "The Iron Valley",
  headingPath: "History > The Siege",
  excerpt: "The Iron Valley stood together against the siege.",
  highlights: [{ start: 4, end: 9 }],
  sourceUrl: "https://wiki.concordlarp.com/The_Iron_Valley",
  pageType: "lore",
  realm: "The Iron Valley",
  sphere: null,
  seasons: ["Winter 226"],
  score: 0.5,
};

describe("ResultCard", () => {
  it("shows the title, page type, and section breadcrumb", () => {
    render(<ResultCard result={baseResult} />);

    expect(screen.getByText("The Iron Valley")).toBeInTheDocument();
    expect(screen.getByText("lore")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("The Siege")).toBeInTheDocument();
  });

  it("wraps the matched term in a mark element", () => {
    render(<ResultCard result={baseResult} />);

    const highlighted = screen.getByText("Iron");

    expect(highlighted.tagName).toBe("MARK");
  });

  it("deep-links to the wiki source in a new tab", () => {
    render(<ResultCard result={baseResult} />);

    const link = screen.getByRole("link", { name: /view on wiki/i });

    expect(link).toHaveAttribute("href", baseResult.sourceUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("omits the breadcrumb when there is no heading path", () => {
    render(<ResultCard result={{ ...baseResult, headingPath: "" }} />);

    expect(screen.queryByLabelText("Section")).not.toBeInTheDocument();
  });
});
