import { SlashCommandBuilder } from "@discordjs/builders";
import { DiscordCommand } from "../interfaces";
import UniversalExecutor, { ConnectionError } from "../universalExecutor";
import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import npmlog from "npmlog";

export class DisconnectCommand implements DiscordCommand {
  data = new SlashCommandBuilder()
    .setName("disconnect")
    .setDescription("Disconnect this channel from Revolt");

  async execute(interaction: CommandInteraction, executor: UniversalExecutor) {
    // Permission check
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply("Error! You don't have enough permissions.");
      return;
    }

    await interaction.deferReply();

    try {
      await executor.disconnect("discord", interaction.channelId);
      await interaction.editReply("Channel disconnected successfully.");
    } catch (e) {
      if (e instanceof ConnectionError) {
        await interaction.editReply("Error! " + e.message);
      } else {
        await interaction.editReply("Something went very wrong. Check the logs.");
        npmlog.error("Discord", "An error occurred while disconnecting channels");
        npmlog.error("Discord", e);
      }
    }
  }
}
