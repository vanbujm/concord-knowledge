import type { DiscordEmbed } from "@/discord/render-embed";

// Minimal Discord REST client for the two things the ravens do: post a message
// to a channel (as the bot) and edit a deferred slash-command reply. Retries a
// couple of times on 429, honouring the retry-after delay.

const DISCORD_API = "https://discord.com/api/v10";
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_SECONDS = 1;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const discordFetch = async (input: {
  url: string;
  method: "POST" | "PATCH";
  body: unknown;
  botToken?: string;
}): Promise<Response> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        "content-type": "application/json",
        ...(input.botToken ? { authorization: `Bot ${input.botToken}` } : {}),
      },
      body: JSON.stringify(input.body),
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitSeconds =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : DEFAULT_RETRY_SECONDS;

      lastError = new Error(`Discord API 429 on ${input.method} ${input.url}`);
      await sleep(waitSeconds * 1000);
      continue;
    }

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(
        `Discord API ${input.method} ${input.url} -> ${response.status}: ${detail}`,
      );
    }

    return response;
  }

  throw new Error(
    `Discord API ${input.method} ${input.url} still rate-limited after ${MAX_ATTEMPTS} attempts`,
    { cause: lastError },
  );
};

export const postChannelMessage = async (input: {
  channelId: string;
  botToken: string;
  content?: string;
  embeds?: DiscordEmbed[];
  mentionUserIds?: string[];
}): Promise<{ id: string }> => {
  // allowed_mentions with an empty parse list means nothing pings unless it is
  // named in `users`, so a stray @everyone in text can never fire.
  const allowedMentions =
    input.mentionUserIds && input.mentionUserIds.length > 0
      ? { parse: [], users: input.mentionUserIds }
      : { parse: [] };

  const response = await discordFetch({
    url: `${DISCORD_API}/channels/${input.channelId}/messages`,
    method: "POST",
    botToken: input.botToken,
    body: {
      content: input.content,
      embeds: input.embeds,
      allowed_mentions: allowedMentions,
    },
  });

  const message: { id: string } = await response.json();

  return { id: message.id };
};

export const editOriginalInteractionResponse = async (input: {
  appId: string;
  interactionToken: string;
  content?: string;
  embeds?: DiscordEmbed[];
}): Promise<void> => {
  await discordFetch({
    url: `${DISCORD_API}/webhooks/${input.appId}/${input.interactionToken}/messages/@original`,
    method: "PATCH",
    body: { content: input.content, embeds: input.embeds },
  });
};
