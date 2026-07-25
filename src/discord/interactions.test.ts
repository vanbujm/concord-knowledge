import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  isAllowedGuild,
  parseCommand,
  verifyInteractionSignature,
  type DiscordInteraction,
} from "@/discord/interactions";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
// Discord provides the raw 32-byte public key as hex; strip the 12-byte SPKI
// prefix (24 hex chars) that der-export prepends.
const rawPublicKeyHex = publicKey
  .export({ format: "der", type: "spki" })
  .toString("hex")
  .slice(24);

const sign = (timestamp: string, body: string): string =>
  cryptoSign(null, Buffer.from(timestamp + body), privateKey).toString("hex");

describe("verifyInteractionSignature", () => {
  const timestamp = "1700000000";
  const body = JSON.stringify({ type: 1 });

  it("accepts a correctly signed request", () => {
    expect(
      verifyInteractionSignature({
        rawBody: body,
        signature: sign(timestamp, body),
        timestamp,
        publicKey: rawPublicKeyHex,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyInteractionSignature({
        rawBody: JSON.stringify({ type: 2 }),
        signature: sign(timestamp, body),
        timestamp,
        publicKey: rawPublicKeyHex,
      }),
    ).toBe(false);
  });

  it("rejects a missing signature or timestamp", () => {
    expect(
      verifyInteractionSignature({
        rawBody: body,
        signature: null,
        timestamp,
        publicKey: rawPublicKeyHex,
      }),
    ).toBe(false);
  });
});

describe("parseCommand", () => {
  it("flattens a top-level command's options", () => {
    const interaction: DiscordInteraction = {
      type: 2,
      guild_id: "guild-1",
      member: { user: { id: "user-1" } },
      data: {
        name: "search",
        options: [{ name: "query", type: 3, value: "stallia" }],
      },
    };

    expect(parseCommand(interaction)).toEqual({
      name: "search",
      subcommand: null,
      options: { query: "stallia" },
      userId: "user-1",
      guildId: "guild-1",
    });
  });

  it("unwraps a subcommand's nested options", () => {
    const interaction: DiscordInteraction = {
      type: 2,
      guild_id: "guild-1",
      member: { user: { id: "user-1" } },
      data: {
        name: "interests",
        options: [
          {
            name: "add",
            type: 1,
            options: [{ name: "keyword", type: 3, value: "Drowned" }],
          },
        ],
      },
    };

    expect(parseCommand(interaction)).toEqual({
      name: "interests",
      subcommand: "add",
      options: { keyword: "Drowned" },
      userId: "user-1",
      guildId: "guild-1",
    });
  });

  it("falls back to the top-level user in a DM context", () => {
    const interaction: DiscordInteraction = {
      type: 2,
      user: { id: "dm-user" },
      data: { name: "search" },
    };

    const parsed = parseCommand(interaction);

    expect(parsed.userId).toBe("dm-user");
    expect(parsed.guildId).toBeNull();
  });
});

describe("isAllowedGuild", () => {
  const allowed = "guild-1";

  it("allows the configured guild", () => {
    expect(isAllowedGuild("guild-1", allowed)).toBe(true);
  });

  it("rejects a different guild", () => {
    expect(isAllowedGuild("guild-2", allowed)).toBe(false);
  });

  it("rejects a DM with no guild", () => {
    expect(isAllowedGuild(null, allowed)).toBe(false);
  });

  it("allows anything when no guild is configured (local dev)", () => {
    expect(isAllowedGuild("guild-2", undefined)).toBe(true);
  });
});
