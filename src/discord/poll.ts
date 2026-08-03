import { composeWindsDispatch } from "@/discord/compose";
import {
  countAnnouncements,
  loadSeenEntryTitles,
  recordAnnounced,
  recordSeenOnly,
} from "@/discord/dedup";
import { postChannelMessage } from "@/discord/discord-rest";
import { fetchSubPage, fetchWindsPages } from "@/discord/fetch-winds";
import {
  GENERAL_SCOPE,
  loadGuildInterests,
} from "@/discord/interests-store";
import { matchKeywords } from "@/discord/match-keywords";
import { parseWindsEntries, type WindsEntry } from "@/discord/parse-winds";
import { getPersona } from "@/discord/personas";
import { buildWindsContent, buildWindsEmbed } from "@/discord/render-embed";
import {
  selectLatestWinds,
  selectNewEntries,
  shouldBaseline,
} from "@/discord/select-entries";
import type { WikiPage } from "@/ingest/fetch-wiki";
import { sourceUrlForTitle } from "@/ingest/upsert";
import { logEvent } from "@/log";

// The scheduled Winds watcher. Fetches the latest Winds of the World page, finds
// entries it has not seen, judges each against the guild's registered keywords,
// and posts the relevant ones as a raven-authored embed, @mentioning the members
// whose personal keywords matched.

const WINDS_TITLE_PREFIX = "Winds of the World - ";
const MAX_POSTS_PER_RUN = 10;
const POST_DELAY_MS = 1000;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
};

// The text an entry is matched against: its title, tag line, and body.
const entryMatchText = (entry: WindsEntry): string =>
  `${entry.entryTitle}\n${entry.displayText ?? ""}\n${entry.tagLine ?? ""}\n${entry.body}`;

export const runPoll = async (input: { backfill: boolean }): Promise<void> => {
  const pages = await fetchWindsPages();
  const latest = selectLatestWinds(pages);

  if (!latest) {
    logEvent("discord_poll_no_winds", { fetched: pages.length });

    return;
  }

  const entries = parseWindsEntries(latest.wikitext);
  const season = latest.title.startsWith(WINDS_TITLE_PREFIX)
    ? latest.title.slice(WINDS_TITLE_PREFIX.length)
    : null;

  const seenTitles = await loadSeenEntryTitles(latest.pageId);

  const entryRef = (entry: WindsEntry) => ({
    windsPageId: latest.pageId,
    windsTitle: latest.title,
    season,
    entry,
  });

  // First-ever run, or an explicit backfill: record the season already under way
  // as seen-only and post nothing, so a backlog is never dumped into the channel.
  if (input.backfill || shouldBaseline(await countAnnouncements())) {
    let baselined = 0;
    let unwritten = 0;

    for (const entry of entries) {
      if (seenTitles.has(entry.entryTitle)) {
        continue;
      }

      // Only baseline entries that have actually been written. A season's index
      // page lists every entry title well before the sub-pages exist, and
      // recording a placeholder as seen would silence it once it is published.
      const subPage = await fetchSubPage(entry.entryTitle);

      if (!subPage) {
        unwritten += 1;

        continue;
      }

      await recordSeenOnly(entryRef(entry));
      baselined += 1;
    }

    logEvent("discord_poll_baselined", {
      windsTitle: latest.title,
      baselined,
      unwritten,
      total: entries.length,
    });

    return;
  }

  const newEntries = selectNewEntries({ entries, seenTitles });

  if (newEntries.length === 0) {
    logEvent("discord_poll_no_new_entries", { windsTitle: latest.title });

    return;
  }

  const guildId = requireEnv("DISCORD_GUILD_ID");
  const channelId = requireEnv("DISCORD_CHANNEL_ID");
  const botToken = requireEnv("DISCORD_BOT_TOKEN");

  const interests = await loadGuildInterests(guildId);
  const distinctKeywords = [...new Set(interests.map((row) => row.keyword))];

  let posted = 0;
  let unwritten = 0;

  for (const entry of newEntries) {
    if (posted >= MAX_POSTS_PER_RUN) {
      logEvent("discord_poll_cap_reached", {
        cap: MAX_POSTS_PER_RUN,
        remaining: newEntries.length - posted,
      });

      break;
    }

    const exactMatched = matchKeywords({
      text: entryMatchText(entry),
      keywords: distinctKeywords,
    });

    let subPage: WikiPage | null = null;

    try {
      subPage = await fetchSubPage(entry.entryTitle);
    } catch (error) {
      // Leave the entry unrecorded so a later run retries it.
      logEvent("discord_poll_subpage_failed", {
        entryTitle: entry.entryTitle,
        error: errorMessage(error),
      });

      continue;
    }

    if (!subPage) {
      // Listed on the index page but not written yet. Recorded nowhere, so the
      // first run after it is published will announce it.
      unwritten += 1;

      continue;
    }

    const analysis = await composeWindsDispatch({
      entry,
      subPageText: subPage.wikitext,
      keywords: distinctKeywords,
    });

    if (!analysis) {
      // Compose failed or was refused: leave the entry unseen so a later run
      // retries it rather than silently dropping it.
      logEvent("discord_poll_compose_null", { entryTitle: entry.entryTitle });

      continue;
    }

    const keywordSet = new Set(distinctKeywords);
    const relatedFromLlm = analysis.relatedKeywords
      .map((keyword) => keyword.toLowerCase())
      .filter((keyword) => keywordSet.has(keyword));

    const unionKeywords = [...new Set([...exactMatched, ...relatedFromLlm])];
    const matchedScopes = [
      ...new Set(
        interests
          .filter((row) => unionKeywords.includes(row.keyword))
          .map((row) => row.scope),
      ),
    ];

    if (matchedScopes.length === 0) {
      await recordSeenOnly(entryRef(entry));
      logEvent("discord_poll_not_relevant", { entryTitle: entry.entryTitle });

      continue;
    }

    const persona = getPersona(analysis.persona);
    const mentionUserIds = matchedScopes.filter(
      (scope) => scope !== GENERAL_SCOPE,
    );

    const content = buildWindsContent({
      persona,
      dispatch: analysis.dispatch,
      mentionUserIds,
    });

    const embed = buildWindsEmbed({
      persona,
      title: entry.displayText ?? entry.entryTitle,
      url: sourceUrlForTitle(entry.entryTitle),
      matchedKeywords: unionKeywords,
      affected: entry.affected,
    });

    const message = await postChannelMessage({
      channelId,
      botToken,
      content,
      embeds: [embed],
      mentionUserIds,
    });

    await recordAnnounced({
      ...entryRef(entry),
      persona: persona.key,
      matchedScopes,
      matchedKeywords: unionKeywords,
      discordMessageId: message.id,
    });

    posted += 1;
    logEvent("discord_poll_posted", {
      entryTitle: entry.entryTitle,
      persona: persona.key,
      matchedScopes,
      messageId: message.id,
    });

    await sleep(POST_DELAY_MS);
  }

  logEvent("discord_poll_done", {
    windsTitle: latest.title,
    newEntries: newEntries.length,
    posted,
    unwritten,
  });
};
