import { SlashCommandBuilder } from "@discordjs/builders";
import { DiscordCommand } from "../interfaces";
import UniversalExecutor from "../universalExecutor";
import { CommandInteraction, PermissionFlagsBits, TextChannel } from "discord.js";
import npmlog from "npmlog";
import { cloneSingleChannel } from "../util/cloner";

export class CloneChannelCommand implements DiscordCommand {
  data = new SlashCommandBuilder()
    .setName("clone_channel")
    .setDescription("Clone this Discord channel to a Revolt channel with optional history")
    .addStringOption((option) =>
      option
        .setName("revolt_channel_id")
        .setDescription("Target Revolt channel ID")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("copy_history")
        .setDescription("Copy message history from this channel")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("max_messages")
        .setDescription("Maximum messages to copy (default: 100, ignored if full is true)")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("full")
        .setDescription("Copy ENTIRE message history (WARNING: Can take a long time!)")
        .setRequired(false)
    );

  async execute(interaction: CommandInteraction, executor: UniversalExecutor) {
    // Permission check
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: "Error! You don't have enough permissions (Administrator required).",
        ephemeral: true,
      });
      return;
    }

    const revoltChannelId = interaction.options.get("revolt_channel_id")?.value as string;
    const copyHistory = (interaction.options.get("copy_history")?.value as boolean) || false;
    const full = (interaction.options.get("full")?.value as boolean) || false;
    const maxMessages = full ? Infinity : ((interaction.options.get("max_messages")?.value as number) || 100);

    if (!revoltChannelId) {
      await interaction.reply({
        content: "Error! You must provide a Revolt channel ID.",
        ephemeral: true,
      });
      return;
    }

    const discordChannel = interaction.channel;
    if (!(discordChannel instanceof TextChannel)) {
      await interaction.reply({
        content: "Error! This command must be used in a text channel.",
        ephemeral: true,
      });
      return;
    }

    try {
      await interaction.deferReply();

      await interaction.editReply({
        content: `🚀 Starting channel clone...\n` +
          `Connecting #${discordChannel.name} to Revolt channel...\n` +
          (copyHistory ? `Will copy ${full ? "ALL" : `up to ${maxMessages}`} messages.` : ""),
      });

      const result = await cloneSingleChannel(
        interaction.client,
        executor.getRevoltClient(),
        {
          discordChannelId: discordChannel.id,
          revoltChannelId: revoltChannelId,
          copyHistory,
          maxMessages,
        },
        async (progress) => {
          if (progress.copiedMessages % 50 === 0 && progress.copiedMessages > 0) {
            try {
              await interaction.editReply({
                content: `⏳ Copying messages... ${progress.copiedMessages} copied so far...`,
              });
            } catch (e) {
              // Ignore edit errors
            }
          }
        }
      );

      let resultMessage = `✅ **Channel clone complete!**\n\n`;
      resultMessage += `Connected: #${discordChannel.name} ↔ ${result.revoltChannelName}\n`;

      if (copyHistory) {
        resultMessage += `Messages copied: ${result.copiedMessages}\n`;
        resultMessage += `Reactions copied: ${result.copiedReactions}\n`;
      }

      if (result.errors.length > 0) {
        resultMessage += `\n⚠️ **Errors (${result.errors.length}):**\n`;
        result.errors.slice(0, 3).forEach((error) => {
          resultMessage += `• ${error}\n`;
        });
        if (result.errors.length > 3) {
          resultMessage += `• ... and ${result.errors.length - 3} more errors\n`;
        }
      }

      resultMessage += `\n✨ The channels are now bridged and will sync in real-time!`;

      await interaction.editReply({ content: resultMessage });

      npmlog.info("Discord", "Clone channel command completed successfully");
    } catch (error) {
      npmlog.error("Discord", "Error during clone channel command");
      npmlog.error("Discord", error);

      await interaction.editReply({
        content: `❌ Error during cloning: ${error.message}\n\nCheck the bot logs for more details.`,
      });
    }
  }
}

