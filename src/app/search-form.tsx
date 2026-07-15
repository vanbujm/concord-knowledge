"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
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

// Ticking facet checkboxes fires a search per change. Wait for the clicks to
// settle before hitting the network so a burst of toggles costs one search, not
// one per checkbox. The explicit Search button and Enter stay immediate.
const FILTER_DEBOUNCE_MS = 300;

export const SearchForm = ({ facets }: { facets: Facets }) => {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // The request currently in flight, so a newer search can abort it. Aborting
  // both saves the server a wasted embed and stops a slow earlier response from
  // landing after (and overwriting) a newer one.
  const inFlightRef = useRef<AbortController | null>(null);

  // The pending debounced-search timer, so we can cancel it when a newer change
  // arrives or the user submits explicitly.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On landing, ping the search endpoint in warm mode so it loads the embedding
  // model (a cold serverless instance downloads it, ~7-8s) while the user is
  // still reading and typing. By submit time the instance is warm, so the first
  // real search does not pay that cost. Fire-and-forget: a failed warm is
  // harmless, the real search just falls back to loading the model itself.
  useEffect(() => {
    fetch("/api/search?warm=1").catch(() => {});
  }, []);

  const runSearch = useCallback(
    async (searchQuery: string, searchFilters: Filters) => {
      const trimmed = searchQuery.trim();

      // A newer search supersedes whatever was running; drop the old request.
      inFlightRef.current?.abort();

      if (!trimmed) {
        inFlightRef.current = null;
        setResults(null);
        setStatus("idle");
        return;
      }

      const controller = new AbortController();
      inFlightRef.current = controller;

      setStatus("loading");
      setErrorMessage("");

      const params = new URLSearchParams({ q: trimmed });

      for (const key of FACET_KEYS) {
        for (const value of searchFilters[key]) {
          params.append(key, value);
        }
      }

      try {
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });

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
      } catch (searchError) {
        // A newer search aborted this one: leave the state to that newer search
        // rather than flashing an error for a request we cancelled on purpose.
        if (searchError instanceof DOMException && searchError.name === "AbortError") {
          return;
        }

        setStatus("error");
        setErrorMessage("Could not reach the search service.");
      }
    },
    [],
  );

  // Coalesce the rapid searches that facet toggles produce into one request.
  const scheduleSearch = useCallback(
    (searchQuery: string, searchFilters: Filters) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        runSearch(searchQuery, searchFilters);
      }, FILTER_DEBOUNCE_MS);
    },
    [runSearch],
  );

  // Cancel any pending debounce and abort any in-flight request on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      inFlightRef.current?.abort();
    };
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // An explicit submit runs now; drop any debounced search still waiting.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    runSearch(query, filters);
  };

  const updateFilter = (key: FacetKey, values: string[]) => {
    const next = { ...filters, [key]: values };

    setFilters(next);

    if (query.trim()) {
      scheduleSearch(query, next);
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
