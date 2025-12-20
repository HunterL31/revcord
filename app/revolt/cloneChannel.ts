import { RevoltCommand } from "../interfaces";
import UniversalExecutor from "../universalExecutor";
import { Message } from "revolt.js/dist/maps/Messages";
import npmlog from "npmlog";
import { cloneSingleChannel } from "../util/cloner";

export class CloneChannelCommand implements RevoltCommand {
  data = {
    name: "clone_channel",
    description: "Clone a Discord channel to this Revolt channel with optional history",
    usage: "rc!clone_channel <Discord channel ID> [--history] [--full] [--max=100]",
  };

  async execute(
    message: Message,
    args: string,
    executor: UniversalExecutor
  ): Promise<void> {
    // Permission check - server owner only
    if (message.channel.server?.owner !== message.author_id) {
      await message.reply("Error! You don't have enough permissions (server owner only).");
      return;
    }

    const argParts = args.trim().split(/\s+/);
    const discordChannelId = argParts[0];

    if (!discordChannelId) {
      await message.reply(
        "Error! You must provide a Discord channel ID.\n" +
        "Usage: `rc!clone_channel <Discord channel ID> [--history] [--full] [--max=100]`"
      );
      return;
    }

    const revoltChannelId = message.channel_id;
    const copyHistory = argParts.includes("--history");
    const full = argParts.includes("--full");

    // Parse max messages (ignored if --full is specified)
    let maxMessages: number = 100;
    if (full) {
      maxMessages = Infinity;
    } else {
      const maxArg = argParts.find(arg => arg.startsWith("--max="));
      if (maxArg) {
        maxMessages = parseInt(maxArg.split("=")[1]) || 100;
      }
    }

    try {
      const statusMessage = await message.reply(
        `🚀 Starting channel clone...\n` +
        `Connecting Discord channel to #${message.channel.name}...\n` +
        (copyHistory ? `Will copy ${full ? "ALL" : `up to ${maxMessages}`} messages.` : "")
      );

      const result = await cloneSingleChannel(
        executor.getDiscordClient(),
        executor.getRevoltClient(),
        {
          discordChannelId,
          revoltChannelId,
          copyHistory,
          maxMessages,
        },
        async (progress) => {
          if (progress.copiedMessages % 50 === 0 && progress.copiedMessages > 0) {
            try {
              await statusMessage.edit({
                content: `⏳ Copying messages... ${progress.copiedMessages} copied so far...`,
              });
            } catch (e) {
              // Ignore edit errors
            }
          }
        }
      );

      let resultMessage = `✅ **Channel clone complete!**\n\n`;
      resultMessage += `Connected: ${result.discordChannelName} ↔ #${message.channel.name}\n`;

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

      await statusMessage.edit({ content: resultMessage });

      npmlog.info("Revolt", "Clone channel command completed successfully");
    } catch (error) {
      npmlog.error("Revolt", "Error during clone channel command");
      npmlog.error("Revolt", error);

      await message.reply(
        `❌ Error during cloning: ${error.message}\n\nCheck the bot logs for more details.`
      );
    }
  }
}

