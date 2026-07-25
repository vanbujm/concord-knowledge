import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";

import {
  editOriginalInteractionResponse,
  postChannelMessage,
} from "@/discord/discord-rest";

const capturedBodySchema = z.object({
  allowed_mentions: z.unknown().optional(),
  embeds: z.array(z.unknown()).optional(),
});

type CapturedBody = z.infer<typeof capturedBodySchema>;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("postChannelMessage", () => {
  it("posts an embed with scoped mentions and returns the message id", async () => {
    const captured: { body: CapturedBody | null } = { body: null };

    server.use(
      http.post(
        "https://discord.com/api/v10/channels/:channelId/messages",
        async ({ request }) => {
          captured.body = capturedBodySchema.parse(await request.json());

          return HttpResponse.json({ id: "msg-1" });
        },
      ),
    );

    const result = await postChannelMessage({
      channelId: "chan-1",
      botToken: "token",
      content: "<@u1>",
      embeds: [{ title: "hi" }],
      mentionUserIds: ["u1"],
    });

    expect(result).toEqual({ id: "msg-1" });
    expect(captured.body?.allowed_mentions).toEqual({
      parse: [],
      users: ["u1"],
    });
    expect(captured.body?.embeds).toHaveLength(1);
  });

  it("retries after a 429 and then succeeds", async () => {
    let attempts = 0;

    server.use(
      http.post(
        "https://discord.com/api/v10/channels/:channelId/messages",
        () => {
          attempts += 1;

          if (attempts === 1) {
            return new HttpResponse(null, {
              status: 429,
              headers: { "retry-after": "0.05" },
            });
          }

          return HttpResponse.json({ id: "msg-2" });
        },
      ),
    );

    const result = await postChannelMessage({
      channelId: "chan-1",
      botToken: "token",
      embeds: [{ title: "x" }],
    });

    expect(attempts).toBe(2);
    expect(result).toEqual({ id: "msg-2" });
  });
});

describe("editOriginalInteractionResponse", () => {
  it("patches the deferred reply with the embed", async () => {
    const captured: { body: CapturedBody | null } = { body: null };

    server.use(
      http.patch(
        "https://discord.com/api/v10/webhooks/:appId/:token/messages/@original",
        async ({ request }) => {
          captured.body = capturedBodySchema.parse(await request.json());

          return HttpResponse.json({ id: "orig" });
        },
      ),
    );

    await editOriginalInteractionResponse({
      appId: "app",
      interactionToken: "tok",
      embeds: [{ title: "result" }],
    });

    expect(captured.body?.embeds).toEqual([{ title: "result" }]);
  });
});
