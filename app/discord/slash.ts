import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import { RESTPostAPIApplicationCommandsJSONBody, Routes } from "discord-api-types/v9";
import { Client } from "discord.js";
import npmlog from "npmlog";

export async function registerSlashCommands(
  rest: REST,
  client: Client,
  guildId: string,
  commandsJson: RESTPostAPIApplicationCommandsJSONBody[],
  log: boolean = true
) {
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
      body: commandsJson,
    });

    if (log) {
      npmlog.info("Discord", "Registered slash commands");
    }
  } catch (e) {
    npmlog.error("Discord", "Couldn't register slash commands");
    npmlog.error("Discord", e);
  }
}
