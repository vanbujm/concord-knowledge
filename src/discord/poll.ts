import { loadBackground } from "@/discord/background";
import {
  composeWindsDispatch,
  type BackgroundNote,
} from "@/discord/compose";
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
  WINDS_TITLE_STEM,
} from "@/discord/select-entries";
import type { WikiPage } from "@/ingest/fetch-wiki";
import { sourceUrlForTitle } from "@/ingest/upsert";
import { logEvent } from "@/log";

// The scheduled Winds watcher. Fetches the latest Winds of the World page, finds
// entries it has not seen, judges each against the guild's registered keywords,
// and posts the relevant ones as a raven-authored embed, @mentioning the members
// whose personal keywords matched.

const WINDS_TITLE_PREFIX = `${WINDS_TITLE_STEM} - `;
const MAX_POSTS_PER_RUN = 10;
const POST_DELAY_MS = 1000;
const DRY_RUN_LIMIT = 1;
const PREVIEW_RULE = "-".repeat(72);

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

// Write a dispatch to stdout exactly as it would reach the channel. This is the
// point of a dry run, so it prints rather than logging a JSON event.
const printDispatchPreview = (input: {
  entry: WindsEntry;
  content: string;
  embed: unknown;
  mentionUserIds: string[];
  background: BackgroundNote[];
}): void => {
  console.log(`\n${PREVIEW_RULE}`);
  console.log(`WOULD POST for: ${input.entry.entryTitle}`);
  console.log(
    `mentions: ${input.mentionUserIds.length > 0 ? input.mentionUserIds.join(", ") : "(none, band-wide only)"}`,
  );
  console.log(
    `background retrieved: ${
      input.background.length > 0
        ? `\n${input.background
            .map(
              (note) =>
                `  - ${note.title}${note.headingPath ? ` > ${note.headingPath}` : ""}`,
            )
            .join("\n")}`
        : "(none)"
    }`,
  );
  console.log(`${PREVIEW_RULE}\n`);
  console.log(input.content);
  console.log(`\nembed:\n${JSON.stringify(input.embed, null, 2)}`);
  console.log(`${PREVIEW_RULE}\n`);
};

// The text an entry is matched against: its title, tag line, and body.
const entryMatchText = (entry: WindsEntry): string =>
  `${entry.entryTitle}\n${entry.displayText ?? ""}\n${entry.tagLine ?? ""}\n${entry.body}`;

export const runPoll = async (input: {
  backfill: boolean;
  // Compose and render everything but post nothing and record nothing, so a
  // dispatch can be read before any of them reach the channel.
  dryRun?: boolean;
  // Watch a named season ("Autumn 226") instead of the newest one. Only useful
  // alongside dryRun, to preview against a season that has been written.
  season?: string | null;
  // How many entries a dry run composes. Each one costs an Anthropic call.
  limit?: number;
}): Promise<void> => {
  const dryRun = input.dryRun ?? false;

  const pages = await fetchWindsPages();
  const latest = input.season
    ? pages.find(
        (page) => page.title === `${WINDS_TITLE_PREFIX}${input.season}`,
      ) ?? null
    : selectLatestWinds(pages);

  if (!latest) {
    logEvent("discord_poll_no_winds", {
      fetched: pages.length,
      requestedSeason: input.season ?? null,
    });

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
  // A dry run never baselines, because baselining writes to the database.
  if (!dryRun && (input.backfill || shouldBaseline(await countAnnouncements()))) {
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

  // A dry run ignores what has already been announced, so a written season can be
  // previewed even though every one of its entries has been seen.
  const pendingEntries = dryRun
    ? entries
    : selectNewEntries({ entries, seenTitles });

  if (pendingEntries.length === 0) {
    logEvent("discord_poll_no_new_entries", { windsTitle: latest.title });

    return;
  }

  const guildId = requireEnv("DISCORD_GUILD_ID");
  const channelId = requireEnv("DISCORD_CHANNEL_ID");
  const botToken = requireEnv("DISCORD_BOT_TOKEN");

  const interests = await loadGuildInterests(guildId);
  const distinctKeywords = [...new Set(interests.map((row) => row.keyword))];

  const postCap = dryRun ? input.limit ?? DRY_RUN_LIMIT : MAX_POSTS_PER_RUN;

  let posted = 0;
  let unwritten = 0;

  for (const entry of pendingEntries) {
    if (posted >= postCap) {
      logEvent("discord_poll_cap_reached", {
        cap: postCap,
        remaining: pendingEntries.length - posted,
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

    // Background is an accuracy aid, not a requirement: if retrieval fails the
    // dispatch still goes out, just judged on the entry text alone.
    let background: BackgroundNote[] = [];

    try {
      background = await loadBackground({
        entry,
        windsTitle: latest.title,
        subPageText: subPage.wikitext,
      });
    } catch (error) {
      logEvent("discord_poll_background_failed", {
        entryTitle: entry.entryTitle,
        error: errorMessage(error),
      });
    }

    const analysis = await composeWindsDispatch({
      entry,
      subPageText: subPage.wikitext,
      keywords: distinctKeywords,
      background,
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
      if (!dryRun) {
        await recordSeenOnly(entryRef(entry));
      }

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

    if (dryRun) {
      printDispatchPreview({
        entry,
        content,
        embed,
        mentionUserIds,
        background,
      });

      posted += 1;

      continue;
    }

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
    dryRun,
    newEntries: pendingEntries.length,
    posted,
    unwritten,
  });
};
