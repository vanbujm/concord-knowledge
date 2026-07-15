"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Facets } from "@/retrieval/facets";
import type { SearchResult } from "@/retrieval/hybrid-search";

import { ResultCard } from "./result-card";

type FacetKey = "realm" | "sphere" | "category" | "season";

// Each facet holds the list of values the user has ticked; an empty list means
// no filter on that facet. The query param key matches the FacetKey.
type Filters = Record<FacetKey, string[]>;

const FACET_KEYS: FacetKey[] = ["realm", "sphere", "category", "season"];

const EMPTY_FILTERS: Filters = {
  realm: [],
  sphere: [],
  category: [],
  season: [],
};

type SearchStatus = "idle" | "loading" | "error";

export const SearchForm = ({ facets }: { facets: Facets }) => {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const runSearch = useCallback(
    async (searchQuery: string, searchFilters: Filters) => {
      const trimmed = searchQuery.trim();

      if (!trimmed) {
        setResults(null);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      const params = new URLSearchParams({ q: trimmed });

      for (const key of FACET_KEYS) {
        for (const value of searchFilters[key]) {
          params.append(key, value);
        }
      }

      try {
        const response = await fetch(`/api/search?${params.toString()}`);

        if (response.status === 429) {
          setStatus("error");
          setErrorMessage(
            "You are searching too quickly. Wait a moment and try again.",
          );
          return;
        }

        if (!response.ok) {
          setStatus("error");
          setErrorMessage("Something went wrong. Please try again.");
          return;
        }

        const payload: SearchResult[] = await response.json();

        setResults(payload);
        setStatus("idle");
      } catch {
        setStatus("error");
        setErrorMessage("Could not reach the search service.");
      }
    },
    [],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(query, filters);
  };

  const updateFilter = (key: FacetKey, values: string[]) => {
    const next = { ...filters, [key]: values };

    setFilters(next);

    if (query.trim()) {
      runSearch(query, next);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the Concord wiki…"
            aria-label="Search query"
            className="h-10 flex-1"
          />

          <Button type="submit" className="h-10 px-4">
            <Search className="size-4" aria-hidden="true" />
            Search
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Realm</Label>
            <MultiSelect
              label="Realm"
              allLabel="All realms"
              options={facets.realms}
              selected={filters.realm}
              onChange={(values) => updateFilter("realm", values)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Sphere</Label>
            <MultiSelect
              label="Sphere"
              allLabel="All spheres"
              options={facets.spheres}
              selected={filters.sphere}
              onChange={(values) => updateFilter("sphere", values)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <MultiSelect
              label="Category"
              allLabel="All categories"
              options={facets.categories}
              selected={filters.category}
              onChange={(values) => updateFilter("category", values)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Season</Label>
            <MultiSelect
              label="Season"
              allLabel="All seasons"
              options={facets.seasons}
              selected={filters.season}
              onChange={(values) => updateFilter("season", values)}
            />
          </div>
        </div>
      </form>

      <SearchResults
        status={status}
        results={results}
        errorMessage={errorMessage}
      />
    </div>
  );
};

const SearchResults = ({
  status,
  results,
  errorMessage,
}: {
  status: SearchStatus;
  results: SearchResult[] | null;
  errorMessage: string;
}) => {
  if (status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((placeholder) => (
          <Skeleton key={placeholder} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {errorMessage}
      </p>
    );
  }

  if (results === null) {
    return null;
  }

  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No matches. Try broader terms or clearing a filter.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {results.length} {results.length === 1 ? "result" : "results"}
      </p>

      {results.map((result) => (
        <ResultCard key={result.chunkId} result={result} />
      ))}
    </div>
  );
};
