import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";

import { WORLD_CONTEXT_BRIEF } from "@/discord/character";
import type { WindsEntry } from "@/discord/parse-winds";
import { PERSONAS, type PersonaKey } from "@/discord/personas";
import { cleanWikitext } from "@/ingest/clean-wikitext";
import { logEvent } from "@/log";

// The one place the ravens use an LLM. It judges which of the reader's keywords a
// Winds entry relates to, picks which raven should speak, and writes the dispatch
// in that raven's voice. A second, lighter call frames /search results.
//
// Default model is Opus 4.8; override with CONCORD_CROW_MODEL (e.g.
// claude-haiku-4-5) since the volume is tiny.

const MODEL = process.env.CONCORD_CROW_MODEL ?? "claude-opus-4-8";
const MAX_TOKENS = 2000;

let cachedClient: Anthropic | null = null;

const getClient = (): Anthropic => {
  cachedClient ??= new Anthropic();

  return cachedClient;
};

const bothVoiceBriefs = (): string =>
  `${PERSONAS.diceria.name}: ${PERSONAS.diceria.voiceBrief}\n\n${PERSONAS.ricordo.name}: ${PERSONAS.ricordo.voiceBrief}`;

const WINDS_SCHEMA = z.object({
  persona: z.enum(["diceria", "ricordo"]),
  relatedKeywords: z.array(z.string()),
  headline: z.string(),
  dispatch: z.string(),
  reasons: z.array(z.string()),
});

export type WindsAnalysis = z.infer<typeof WINDS_SCHEMA>;

const SEARCH_INTRO_SCHEMA = z.object({
  persona: z.enum(["diceria", "ricordo"]),
  intro: z.string(),
});

export const composeWindsDispatch = async (input: {
  entry: WindsEntry;
  subPageText: string | null;
  keywords: string[];
}): Promise<WindsAnalysis | null> => {
  const system = [
    "You are one of two ravens who carry news to the warband The Sablier Rouge. Choose whichever raven best fits this entry and write as that one.",
    bothVoiceBriefs(),
    WORLD_CONTEXT_BRIEF,
    "Write a `dispatch` of two to four sentences summarising the entry for the band, in the chosen raven's voice. Give a plain `headline`. In `relatedKeywords`, list only the provided keywords the entry genuinely relates to (an empty list if none). In `reasons`, note briefly why, one short phrase per matched keyword.",
  ].join("\n\n");

  const entryText = cleanWikitext(input.entry.body);
  const subPage = input.subPageText ? cleanWikitext(input.subPageText) : "";

  const userContent = [
    `Entry title: ${input.entry.entryTitle}`,
    input.entry.affected.length > 0
      ? `Affected: ${input.entry.affected.join(", ")}`
      : null,
    `Keywords to judge relatedness against:\n${input.keywords.map((keyword) => `- ${keyword}`).join("\n")}`,
    `Entry text:\n${entryText}`,
    subPage ? `Full sub-page:\n${subPage}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(WINDS_SCHEMA),
    },
    system,
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    logEvent("discord_compose_refusal", { entryTitle: input.entry.entryTitle });

    return null;
  }

  return response.parsed_output;
};

export const composeSearchIntro = async (input: {
  query: string;
  resultTitles: string[];
}): Promise<{ persona: PersonaKey; intro: string } | null> => {
  const system = [
    "You are one of two ravens answering a wiki search for the warband The Sablier Rouge. Choose whichever raven best fits and write as that one.",
    bothVoiceBriefs(),
    "Write a single short sentence (`intro`) in the chosen raven's voice, framing the search results that follow. Do not restate the results themselves.",
  ].join("\n\n");

  const userContent = [
    `Search query: ${input.query}`,
    input.resultTitles.length > 0
      ? `Result page titles:\n${input.resultTitles.map((title) => `- ${title}`).join("\n")}`
      : "No results were found.",
  ].join("\n\n");

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 400,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "low",
      format: zodOutputFormat(SEARCH_INTRO_SCHEMA),
    },
    system,
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    return null;
  }

  return response.parsed_output;
};
