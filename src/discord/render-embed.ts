import type { Persona } from "@/discord/personas";

// Build the Discord embeds the ravens post. Pure and side-effect free: the raven
// identity rides in the embed author line, and every field is clamped to
// Discord's limits (title 256, description 4096, field value 1024, 25 fields).

export type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbed = {
  author?: { name: string; icon_url?: string };
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
};

const TITLE_MAX = 256;
const DESCRIPTION_MAX = 4096;
const FIELD_VALUE_MAX = 1024;
const CONTENT_MAX = 2000;

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const personaAuthor = (persona: Persona): DiscordEmbed["author"] => ({
  name: persona.name,
  ...(persona.avatarUrl ? { icon_url: persona.avatarUrl } : {}),
});

// The message content: the raven's dispatch as full-width plain text, prefixed
// with any @mentions. Kept separate from the embed so the prose is not squeezed
// into the embed's fixed narrow column.
export const buildWindsContent = (input: {
  persona: Persona;
  dispatch: string;
  mentionUserIds: string[];
}): string => {
  const mentionLine =
    input.mentionUserIds.length > 0
      ? input.mentionUserIds.map((userId) => `<@${userId}>`).join(" ")
      : "";

  const line = `**${input.persona.name}** ${input.dispatch}`;
  const body = mentionLine ? `${mentionLine}\n${line}` : line;

  return truncate(body, CONTENT_MAX);
};

// The compact card that rides beneath the dispatch: raven identity, the linked
// entry title, and the interest/affected tags. No description, the prose lives
// in the message content.
export const buildWindsEmbed = (input: {
  persona: Persona;
  title: string;
  url: string;
  matchedKeywords: string[];
  affected: string[];
}): DiscordEmbed => {
  const fields: DiscordEmbedField[] = [];

  if (input.matchedKeywords.length > 0) {
    fields.push({
      name: "Of interest",
      value: truncate(input.matchedKeywords.join(", "), FIELD_VALUE_MAX),
    });
  }

  if (input.affected.length > 0) {
    fields.push({
      name: "Affects",
      value: truncate(input.affected.join(" · "), FIELD_VALUE_MAX),
      inline: true,
    });
  }

  return {
    title: truncate(input.title, TITLE_MAX),
    url: input.url,
    color: input.persona.color,
    ...(fields.length > 0 ? { fields } : {}),
  };
};

export type SearchEmbedResult = {
  title: string;
  sourceUrl: string;
  section: string | null;
  excerpt: string;
};

export const buildSearchEmbed = (input: {
  persona: Persona;
  query: string;
  intro: string;
  results: SearchEmbedResult[];
}): DiscordEmbed => {
  const lines = input.results.map((result) => {
    const heading = result.section
      ? `**[${result.title}](${result.sourceUrl})** — ${result.section}`
      : `**[${result.title}](${result.sourceUrl})**`;

    return `${heading}\n${result.excerpt}`;
  });

  const body =
    input.results.length > 0
      ? `${input.intro}\n\n${lines.join("\n\n")}`
      : `${input.intro}\n\nNothing in the archive answers to that.`;

  return {
    author: personaAuthor(input.persona),
    title: truncate(`Search: ${input.query}`, TITLE_MAX),
    description: truncate(body, DESCRIPTION_MAX),
    color: input.persona.color,
  };
};
