import { createPublicKey, verify as cryptoVerify } from "node:crypto";

// Discord slash-command interactions arrive as signed HTTP POSTs. This module
// verifies the Ed25519 signature (no dependency: Node's crypto handles it) and
// flattens a command payload into a simple shape for the route to act on.

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

export const MessageFlags = {
  EPHEMERAL: 64,
} as const;

// The 12-byte ASN.1/DER prefix for an Ed25519 SubjectPublicKeyInfo. Prepending
// it to the raw 32-byte key lets node:crypto build a public key object.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const publicKeyFromHex = (hex: string) =>
  createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(hex, "hex")]),
    format: "der",
    type: "spki",
  });

// Verify a Discord interaction request. The signature covers timestamp + raw
// body, so the raw text must be verified before it is parsed as JSON.
export const verifyInteractionSignature = (input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
}): boolean => {
  if (!input.signature || !input.timestamp) {
    return false;
  }

  try {
    const key = publicKeyFromHex(input.publicKey);
    const data = Buffer.from(input.timestamp + input.rawBody);

    return cryptoVerify(null, data, key, Buffer.from(input.signature, "hex"));
  } catch {
    return false;
  }
};

type CommandOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: CommandOption[];
};

export type DiscordInteraction = {
  type: number;
  id?: string;
  token?: string;
  application_id?: string;
  guild_id?: string;
  data?: { name?: string; options?: CommandOption[] };
  member?: { user?: { id?: string }; permissions?: string };
  user?: { id?: string };
};

export type ParsedCommand = {
  name: string;
  subcommandGroup: string | null;
  subcommand: string | null;
  options: Record<string, string>;
  userId: string | null;
  guildId: string | null;
  memberPermissions: string | null;
};

const SUB_COMMAND = 1;
const SUB_COMMAND_GROUP = 2;

// Flatten an interaction into command name, subcommand, and string options.
// Discord nests a subcommand's parameters inside a type-1 option, and nests that
// type-1 option inside a type-2 option when the command groups its subcommands
// (`/warband interests add`). Unwrap both levels so callers always see a flat
// options record, whichever shape the command uses.
export const parseCommand = (
  interaction: DiscordInteraction,
): ParsedCommand => {
  const name = interaction.data?.name ?? "";
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
  const guildId = interaction.guild_id ?? null;
  const memberPermissions = interaction.member?.permissions ?? null;

  const topOptions = interaction.data?.options ?? [];
  const groupOption = topOptions.find(
    (option) => option.type === SUB_COMMAND_GROUP,
  );

  const groupedOptions = groupOption?.options ?? topOptions;
  const subcommandOption = groupedOptions.find(
    (option) => option.type === SUB_COMMAND,
  );

  const optionList = subcommandOption?.options ?? groupedOptions;

  const options: Record<string, string> = {};

  for (const option of optionList) {
    if (option.value !== undefined) {
      options[option.name] = String(option.value);
    }
  }

  return {
    name,
    subcommandGroup: groupOption?.name ?? null,
    subcommand: subcommandOption?.name ?? null,
    options,
    userId,
    guildId,
    memberPermissions,
  };
};

// Guard so the commands only work in the configured guild: even if the bot is
// invited to another server, interactions from a different guild (or a DM) are
// refused, so they cannot touch the API key or database. When no guild is
// configured (local dev), everything is allowed.
export const isAllowedGuild = (
  guildId: string | null,
  allowedGuildId: string | undefined,
): boolean => !allowedGuildId || guildId === allowedGuildId;

// Discord sends a member's computed permissions as a decimal bitfield string,
// because the field can outgrow the largest integer a JS number holds exactly.
// It is parsed as a BigInt for that reason. Administrator implies every other
// permission, so either of these two bits is enough to pass.
const ADMINISTRATOR_BIT = BigInt(8);
const MANAGE_GUILD_BIT = BigInt(32);
const NO_BITS = BigInt(0);

// Guard for commands that write shared state. Registering a command with
// `default_member_permissions` hides it from ordinary members, but that is only
// a default: a server admin can re-grant it to anyone under the server's
// Integrations settings, so the permission is checked again here.
export const hasGuildManagerPermission = (
  memberPermissions: string | null,
): boolean => {
  if (!memberPermissions) {
    return false;
  }

  try {
    const permissionBits = BigInt(memberPermissions);

    return (
      (permissionBits & ADMINISTRATOR_BIT) !== NO_BITS ||
      (permissionBits & MANAGE_GUILD_BIT) !== NO_BITS
    );
  } catch {
    return false;
  }
};
