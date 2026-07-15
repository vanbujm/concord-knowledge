import { listFacets } from "@/retrieval/facets";

import { SearchForm } from "./search-form";

// Regenerate the cached page at most once an hour so facets from a fresh
// ingestion (new seasons, categories) show up without a redeploy. 3600 is in
// seconds, the unit Next.js expects for revalidate.
export const revalidate = 3600;

// The server shell: it loads the facet values (realms, spheres, categories,
// seasons with their counts) on the server and hands them to the client search
// island, which owns the query box, the filters, and fetching /api/search.
const Home = async () => {
  const facets = await listFacets();

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:py-20">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Concord LARP
        </p>

        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Concord Wiki Search
        </h1>

        <p className="max-w-xl text-muted-foreground">
          Hybrid keyword and semantic search across the Concord wiki. Every
          result is a short excerpt that links back to the full page.
        </p>
      </header>

      <SearchForm facets={facets} />

      <footer className="mt-auto pt-8 text-xs text-muted-foreground">
        Results are short excerpts from the{" "}
        <a
          href="https://wiki.concordlarp.com"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Concord wiki
        </a>
        . Follow each link for the full, canonical page.
      </footer>
    </main>
  );
};

export default Home;
