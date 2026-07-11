import { createMcpHandler } from "mcp-handler";
import * as z from "zod";

import { MAX_RESULT_LIMIT } from "@/config/display";
import { checkRateLimit, clientIdentifier } from "@/rate-limit";
import { listFacets } from "@/retrieval/facets";
import { getPageByTitle } from "@/retrieval/get-page";
import { runHybridSearch } from "@/retrieval/hybrid-search";

// MCP server for the Concord wiki, exposed over Streamable HTTP at /api/mcp so
// people can wire their own assistant into the same retrieval core the web UI
// uses. Every tool returns short cited excerpts plus a source URL; none returns
// full page text.

const POSTURE =
  "Each result is a short cited excerpt from the Concord LARP wiki plus a source URL; the full content lives at the linked page. Non-commercial, excerpt-only.";

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_wiki",
      {
        title: "Search the Concord wiki",
        description: `Hybrid semantic + keyword search over the Concord LARP wiki. ${POSTURE}`,
        inputSchema: {
          query: z.string().min(1).describe("What to search for."),
          realm: z
            .string()
            .optional()
            .describe("Filter to a realm, e.g. 'The Iron Valley'."),
          sphere: z
            .string()
            .optional()
            .describe("Filter to a sphere, e.g. 'Panoply'."),
          pageType: z
            .string()
            .optional()
            .describe(
              "Filter to a page type: rules, lore, newsletter, history, war-report, fiction.",
            ),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_RESULT_LIMIT)
            .optional()
            .describe("Maximum results (default 10)."),
        },
      },
      async ({ query, realm, sphere, pageType, limit }) => {
        const results = await runHybridSearch({
          query,
          filters: { realm, sphere, pageType },
          limit,
        });

        const cited = results.map((result) => ({
          title: result.title,
          section: result.headingPath || null,
          excerpt: result.excerpt,
          sourceUrl: result.sourceUrl,
          pageType: result.pageType,
          realm: result.realm,
          sphere: result.sphere,
          seasons: result.seasons,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify({ results: cited }, null, 2) }],
        };
      },
    );

    server.registerTool(
      "get_page",
      {
        title: "Get a Concord wiki page",
        description: `Return one wiki page by title as section-by-section excerpts. ${POSTURE}`,
        inputSchema: {
          title: z
            .string()
            .min(1)
            .describe("Exact page title, e.g. 'The Iron Valley'."),
        },
      },
      async ({ title }) => {
        const page = await getPageByTitle(title);

        if (!page) {
          return {
            content: [{ type: "text", text: `No page found for "${title}".` }],
            isError: true,
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(page, null, 2) }] };
      },
    );

    server.registerTool(
      "list_facets",
      {
        title: "List Concord wiki facets",
        description:
          "List the filter values (realms, spheres, page types, seasons) with document counts, for use with search_wiki filters.",
        inputSchema: {},
      },
      async () => {
        const facets = await listFacets();

        return { content: [{ type: "text", text: JSON.stringify(facets, null, 2) }] };
      },
    );
  },
  { serverInfo: { name: "concord-wiki-search", version: "0.1.0" } },
  { basePath: "/api", maxDuration: 60, disableSse: true },
);

const handler = async (request: Request): Promise<Response> => {
  const allowed = await checkRateLimit(clientIdentifier(request));

  if (!allowed) {
    return new Response("Rate limit exceeded. Try again shortly.", {
      status: 429,
    });
  }

  return mcpHandler(request);
};

export { handler as GET, handler as POST };

export const runtime = "nodejs";
export const maxDuration = 60;
