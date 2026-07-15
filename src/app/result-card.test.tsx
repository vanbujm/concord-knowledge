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
  categories: ["Realms of the Concord"],
  realm: "The Iron Valley",
  sphere: null,
  seasons: ["Winter 226"],
  score: 0.5,
};

describe("ResultCard", () => {
  it("shows the title, tags, and section breadcrumb", () => {
    render(<ResultCard result={baseResult} />);

    // The title also appears as the realm tag here, so match by count.
    expect(screen.getAllByText("The Iron Valley").length).toBeGreaterThan(0);
    expect(screen.getByText("Realms of the Concord")).toBeInTheDocument();
    expect(screen.getByText("Winter 226")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("The Siege")).toBeInTheDocument();
  });

  it("renders realm, sphere, category, and season tags", () => {
    render(
      <ResultCard
        result={{
          ...baseResult,
          title: "Panoply Ceremonies",
          realm: "Andash",
          sphere: "Panoply",
          categories: ["Ceremonies"],
          seasons: ["Autumn 226"],
        }}
      />,
    );

    expect(screen.getByText("Andash")).toBeInTheDocument();
    expect(screen.getByText("Panoply")).toBeInTheDocument();
    expect(screen.getByText("Ceremonies")).toBeInTheDocument();
    expect(screen.getByText("Autumn 226")).toBeInTheDocument();
  });

  it("does not repeat a category the realm or sphere tag already shows", () => {
    render(
      <ResultCard
        result={{
          ...baseResult,
          title: "Sphere of Prosperity",
          realm: null,
          sphere: "Panoply",
          categories: ["Panoply", "Ceremonies"],
          seasons: [],
        }}
      />,
    );

    // "Panoply" appears once (the sphere tag), not again as a category tag.
    expect(screen.getAllByText("Panoply")).toHaveLength(1);
    expect(screen.getByText("Ceremonies")).toBeInTheDocument();
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
