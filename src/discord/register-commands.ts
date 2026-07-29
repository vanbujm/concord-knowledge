import { logEvent } from "@/log";

// One-time slash-command registration. Registers the ravens' commands to a
// single guild (instant, unlike global commands), so re-running it after a
// command definition changes updates them immediately. Run: bun run discord:register.

const SUB_COMMAND = 1;
const SUB_COMMAND_GROUP = 2;
const STRING = 3;

// Manage Server, as a decimal permission bitfield. Discord hides a command with
// this set from members who lack it; Administrator holders have it implicitly.
// Set to "8" to narrow the gate to Administrator alone.
const MANAGE_GUILD = "32";

const commands = [
  {
    name: "search",
    description: "Search the Concord wiki and get back cited results.",
    options: [
      {
        type: STRING,
        name: "query",
        description: "What to search for.",
        required: true,
      },
    ],
  },
  {
    name: "interests",
    description: "Manage the keywords the ravens watch for you.",
    options: [
      {
        type: SUB_COMMAND,
        name: "add",
        description: "Add a keyword to your interests.",
        options: [
          {
            type: STRING,
            name: "keyword",
            description: "The keyword to watch for.",
            required: true,
          },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "remove",
        description: "Remove a keyword from your interests.",
        options: [
          {
            type: STRING,
            name: "keyword",
            description: "The keyword to stop watching.",
            required: true,
          },
        ],
      },
      {
        type: SUB_COMMAND,
        name: "list",
        description: "List your keywords and the band's shared ones.",
      },
    ],
  },
  {
    name: "warband",
    description: "Manage what the ravens watch for the whole warband.",
    default_member_permissions: MANAGE_GUILD,
    options: [
      {
        type: SUB_COMMAND_GROUP,
        name: "interests",
        description: "Manage the warband's shared keywords.",
        options: [
          {
            type: SUB_COMMAND,
            name: "add",
            description: "Add a keyword the ravens watch for everyone.",
            options: [
              {
                type: STRING,
                name: "keyword",
                description: "The keyword to watch for.",
                required: true,
              },
            ],
          },
          {
            type: SUB_COMMAND,
            name: "remove",
            description: "Remove a keyword from the warband's shared list.",
            options: [
              {
                type: STRING,
                name: "keyword",
                description: "The keyword to stop watching.",
                required: true,
              },
            ],
          },
          {
            type: SUB_COMMAND,
            name: "list",
            description: "List the warband's shared keywords.",
          },
        ],
      },
    ],
  },
];

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
};

const main = async () => {
  const appId = requireEnv("DISCORD_APP_ID");
  const guildId = requireEnv("DISCORD_GUILD_ID");
  const botToken = requireEnv("DISCORD_BOT_TOKEN");

  const response = await fetch(
    `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify(commands),
    },
  );

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `Command registration failed: ${response.status} ${detail}`,
    );
  }

  logEvent("discord_commands_registered", {
    count: commands.length,
    guildId,
  });
};

main()
  .then(() => process.exit(0))
  .catch((registerError) => {
    console.error(registerError);
    process.exit(1);
  });
