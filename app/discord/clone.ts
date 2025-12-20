import { SlashCommandBuilder } from "@discordjs/builders";
import { DiscordCommand } from "../interfaces";
import UniversalExecutor from "../universalExecutor";
import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import npmlog from "npmlog";
import { cloneChannelStructure, getCloneSummary } from "../util/cloner";

export class CloneCommand implements DiscordCommand {
  data = new SlashCommandBuilder()
    .setName("clone")
    .setDescription("Clone this Discord server structure to a Revolt server")
    .addStringOption((option) =>
      option
        .setName("revolt_server_id")
        .setDescription("Target Revolt server ID")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("copy_history")
        .setDescription("Copy message history (WARNING: This will take a long time!)")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("max_messages")
        .setDescription("Maximum messages to copy per channel (default: 100, ignored if full is true)")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("full")
        .setDescription("Copy ENTIRE message history (WARNING: Can take hours for large servers!)")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("preview")
        .setDescription("Preview what would be cloned without actually cloning")
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

    const revoltServerId = interaction.options.get("revolt_server_id")?.value as string;
    const copyHistory = (interaction.options.get("copy_history")?.value as boolean) || false;
    const full = (interaction.options.get("full")?.value as boolean) || false;
    const maxMessages = full ? Infinity : ((interaction.options.get("max_messages")?.value as number) || 100);
    const preview = (interaction.options.get("preview")?.value as boolean) || false;

    if (!revoltServerId) {
      await interaction.reply({
        content: "Error! You must provide a Revolt server ID.",
        ephemeral: true,
      });
      return;
    }

    const serverId = interaction.guildId;
    if (!serverId) {
      await interaction.reply({
        content: "Error! This command must be used in a server.",
        ephemeral: true,
      });
      return;
    }

    // Preview mode
    if (preview) {
      try {
        await interaction.deferReply();
        
        const summary = await getCloneSummary(
          interaction.client,
          serverId
        );

        await interaction.editReply({
          content: summary,
        });
      } catch (error) {
        npmlog.error("Discord", "Error generating clone preview");
        npmlog.error("Discord", error);
        await interaction.editReply({
          content: `Error generating preview: ${error.message}`,
        });
      }
      return;
    }

    // Actual cloning
    try {
      await interaction.deferReply();

      await interaction.editReply({
        content: `🚀 Starting server clone...\nThis may take several minutes. Please be patient!`,
      });

      const progress = await cloneChannelStructure(
        interaction.client,
        executor.getRevoltClient(),
        {
          serverId,
          targetRevoltServerId: revoltServerId,
          copyHistory,
          maxMessagesPerChannel: maxMessages,
        },
        async (prog) => {
          // Update progress every few channels
          if (prog.clonedChannels % 5 === 0) {
            try {
              await interaction.editReply({
                content: `⏳ Cloning in progress...\n` +
                  `Channels: ${prog.clonedChannels}/${prog.totalChannels}\n` +
                  `${copyHistory ? `Messages: ${prog.copiedMessages}\n` : ""}` +
                  `Current: ${prog.currentChannel || "Starting..."}`,
              });
            } catch (e) {
              // Ignore edit errors during progress updates
            }
          }
        }
      );

      let resultMessage = `✅ **Server clone complete!**\n\n`;
      resultMessage += `Channels cloned: ${progress.clonedChannels}/${progress.totalChannels}\n`;
      
      if (copyHistory) {
        resultMessage += `Messages copied: ${progress.copiedMessages}\n`;
      }

      if (progress.errors.length > 0) {
        resultMessage += `\n⚠️ **Errors (${progress.errors.length}):**\n`;
        progress.errors.slice(0, 5).forEach((error) => {
          resultMessage += `• ${error}\n`;
        });
        if (progress.errors.length > 5) {
          resultMessage += `• ... and ${progress.errors.length - 5} more errors\n`;
        }
      }

      resultMessage += `\n✨ The channels are now bridged and will sync messages in real-time!`;

      await interaction.editReply({
        content: resultMessage,
      });

      npmlog.info("Discord", "Clone command completed successfully");
    } catch (error) {
      npmlog.error("Discord", "Error during clone command");
      npmlog.error("Discord", error);

      await interaction.editReply({
        content: `❌ Error during cloning: ${error.message}\n\nCheck the bot logs for more details.`,
      });
    }
  }
}
