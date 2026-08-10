import { after } from "next/server";

import { composeSearchIntro } from "@/discord/compose";
import { editOriginalInteractionResponse } from "@/discord/discord-rest";
import {
  hasGuildManagerPermission,
  InteractionResponseType,
  InteractionType,
  isAllowedGuild,
  MessageFlags,
  parseCommand,
  verifyInteractionSignature,
  type DiscordInteraction,
  type ParsedCommand,
} from "@/discord/interactions";
import {
  addInterest,
  clearPersonalInterest,
  GENERAL_SCOPE,
  listInterests,
  removeInterest,
} from "@/discord/interests-store";
import { getPersona } from "@/discord/personas";
import { buildSearchEmbed } from "@/discord/render-embed";
import { logEvent } from "@/log";
import { checkRateLimit } from "@/rate-limit";
import { runHybridSearch } from "@/retrieval/hybrid-search";

// Discord HTTP interactions endpoint. Slash commands POST here; the app already
// runs on Vercel, so the ravens' commands need no separate host. /search embeds
// the query locally, whose cold start exceeds Discord's 3s ACK deadline, so it
// defers and edits the reply afterwards via after(). /interests is a quick DB op
// answered inline.

const SEARCH_RESULT_LIMIT = 5;

const ephemeral = (content: string): Response =>
  Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: MessageFlags.EPHEMERAL },
  });

const handleInterests = async (command: ParsedCommand): Promise<Response> => {
  if (!command.guildId || !command.userId) {
    return ephemeral("This command only works inside a server.");
  }

  const guildId = command.guildId;
  const scope = command.userId;

  if (command.subcommand === "add") {
    const keyword = command.options.keyword ?? "";
    const added = await addInterest({ guildId, scope, keyword });

    return ephemeral(
      added
        ? `Added **${keyword}** to your interests.`
        : `**${keyword}** is already on your list (or was empty).`,
    );
  }

  if (command.subcommand === "remove") {
    const keyword = command.options.keyword ?? "";
    const removed = await removeInterest({ guildId, scope, keyword });

    return ephemeral(
      removed
        ? `Removed **${keyword}** from your interests.`
        : `**${keyword}** was not on your list.`,
    );
  }

  if (command.subcommand === "list") {
    const [personal, general] = await Promise.all([
      listInterests({ guildId, scope }),
      listInterests({ guildId, scope: GENERAL_SCOPE }),
    ]);

    const personalLine =
      personal.length > 0
        ? personal.join(", ")
        : "(none yet — add some with /interests add)";
    const generalLine = general.length > 0 ? general.join(", ") : "(none)";

    return ephemeral(
      `**Your keywords:** ${personalLine}\n**Band keywords:** ${generalLine}`,
    );
  }

  return ephemeral("Use /interests add, remove, or list.");
};

const handleWarbandInterests = async (
  command: ParsedCommand,
): Promise<Response> => {
  if (!command.guildId) {
    return ephemeral("This command only works inside a server.");
  }

  if (!hasGuildManagerPermission(command.memberPermissions)) {
    return ephemeral(
      "Only the warband's officers may change the shared keywords. Use /interests to manage your own.",
    );
  }

  const guildId = command.guildId;
  const scope = GENERAL_SCOPE;

  if (command.subcommand === "add") {
    const keyword = command.options.keyword ?? "";
    const added = await addInterest({ guildId, scope, keyword });

    // The band keyword supersedes personal copies, which would otherwise ping
    // their owners for something the whole band already watches.
    const supersededScopes = await clearPersonalInterest({ guildId, keyword });

    const headline = added
      ? `Added **${keyword}** to the warband's keywords. The ravens now watch it for everyone.`
      : `**${keyword}** is already on the warband's list (or was empty).`;

    if (supersededScopes.length === 0) {
      return ephemeral(headline);
    }

    const listCount =
      supersededScopes.length === 1
        ? "1 personal list"
        : `${supersededScopes.length} personal lists`;

    return ephemeral(
      `${headline}\nRemoved it from ${listCount}, since the band keyword already posts it without pinging anyone.`,
    );
  }

  if (command.subcommand === "remove") {
    const keyword = command.options.keyword ?? "";
    const removed = await removeInterest({ guildId, scope, keyword });

    return ephemeral(
      removed
        ? `Removed **${keyword}** from the warband's keywords.`
        : `**${keyword}** was not on the warband's list.`,
    );
  }

  if (command.subcommand === "list") {
    const general = await listInterests({ guildId, scope });

    return ephemeral(
      general.length > 0
        ? `**Warband keywords:** ${general.join(", ")}`
        : "The warband has no shared keywords yet. Add one with /warband interests add.",
    );
  }

  return ephemeral("Use /warband interests add, remove, or list.");
};

const handleSearch = (
  interaction: DiscordInteraction,
  command: ParsedCommand,
): Response => {
  const appId = process.env.DISCORD_APP_ID;
  const interactionToken = interaction.token;
  const query = command.options.query ?? "";

  if (!appId || !interactionToken) {
    return ephemeral("Search is not configured.");
  }

  // Do the slow work after the ACK is sent, then edit the deferred reply.
  after(async () => {
    try {
      const allowed = await checkRateLimit(command.userId ?? "anonymous");

      if (!allowed) {
        await editOriginalInteractionResponse({
          appId,
          interactionToken,
          content: "Slow down a moment, then ask again.",
        });

        return;
      }

      const results = await runHybridSearch({
        query,
        limit: SEARCH_RESULT_LIMIT,
      });
      const intro = await composeSearchIntro({
        query,
        resultTitles: results.map((result) => result.title),
      });
      const persona = getPersona(intro?.persona ?? "ricordo");

      const embed = buildSearchEmbed({
        persona,
        query,
        intro: intro?.intro ?? "",
        results: results.map((result) => ({
          title: result.title,
          sourceUrl: result.sourceUrl,
          section: result.headingPath || null,
          excerpt: result.excerpt,
        })),
      });

      await editOriginalInteractionResponse({
        appId,
        interactionToken,
        embeds: [embed],
      });
    } catch (searchError) {
      logEvent("discord_search_failed", {
        query,
        error:
          searchError instanceof Error
            ? searchError.message
            : String(searchError),
      });

      await editOriginalInteractionResponse({
        appId,
        interactionToken,
        content: "The search faltered. Try again shortly.",
      }).catch(() => {});
    }
  });

  return Response.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  });
};

export const POST = async (request: Request): Promise<Response> => {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!publicKey) {
    return new Response("Discord interactions are not configured.", {
      status: 500,
    });
  }

  const rawBody = await request.text();

  const valid = verifyInteractionSignature({
    rawBody,
    signature: request.headers.get("x-signature-ed25519"),
    timestamp: request.headers.get("x-signature-timestamp"),
    publicKey,
  });

  if (!valid) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction: DiscordInteraction = JSON.parse(rawBody);

  if (interaction.type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const command = parseCommand(interaction);

    const allowedGuild = isAllowedGuild({
      guildId: command.guildId,
      allowedGuildId: process.env.DISCORD_GUILD_ID,
      isProduction: process.env.NODE_ENV === "production",
    });

    if (!allowedGuild) {
      return ephemeral("The ravens only answer within the Sablier Rouge.");
    }

    if (command.name === "interests") {
      return handleInterests(command);
    }

    if (command.name === "warband" && command.subcommandGroup === "interests") {
      return handleWarbandInterests(command);
    }

    if (command.name === "search") {
      return handleSearch(interaction, command);
    }
  }

  return ephemeral("Unknown command.");
};

export const runtime = "nodejs";
export const maxDuration = 60;
