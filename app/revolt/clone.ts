import { RevoltCommand } from "../interfaces";
import UniversalExecutor from "../universalExecutor";
import { Message } from "revolt.js/dist/maps/Messages";
import npmlog from "npmlog";
import { cloneChannelStructure, getCloneSummary } from "../util/cloner";

export class CloneCommand implements RevoltCommand {
  data = {
    name: "clone",
    description: "Clone a Discord server structure to this Revolt server",
    usage: "rc!clone <Discord server ID> [--history] [--full] [--max=100] [--preview]",
  };

  async execute(
    message: Message,
    args: string,
    executor: UniversalExecutor
  ): Promise<void> {
    // Permission check
    if (message.channel.server.owner !== message.author_id) {
      await message.reply("Error! You don't have enough permissions (server owner only).");
      return;
    }

    const argParts = args.trim().split(/\s+/);
    const discordServerId = argParts[0];

    if (!discordServerId) {
      await message.reply(
        "Error! You must provide a Discord server ID.\n" +
        "Usage: `rc!clone <Discord server ID> [--history] [--full] [--max=100] [--preview]`"
      );
      return;
    }

    const revoltServerId = message.channel.server_id;
    const copyHistory = argParts.includes("--history");
    const full = argParts.includes("--full");
    const preview = argParts.includes("--preview");
    
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

    // Preview mode
    if (preview) {
      try {
        const summary = await getCloneSummary(
          executor.getDiscordClient(),
          discordServerId
        );

        await message.reply(summary);
      } catch (error) {
        npmlog.error("Revolt", "Error generating clone preview");
        npmlog.error("Revolt", error);
        await message.reply(`Error generating preview: ${error.message}`);
      }
      return;
    }

    // Actual cloning
    try {
      const statusMessage = await message.reply(
        "🚀 Starting server clone...\nThis may take several minutes. Please be patient!"
      );

      const progress = await cloneChannelStructure(
        executor.getDiscordClient(),
        executor.getRevoltClient(),
        {
          serverId: discordServerId,
          targetRevoltServerId: revoltServerId,
          copyHistory,
          maxMessagesPerChannel: maxMessages,
        },
        async (prog) => {
          // Update progress every few channels
          if (prog.clonedChannels % 5 === 0) {
            try {
              await statusMessage.edit({
                content:
                  `⏳ Cloning in progress...\n` +
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

      await statusMessage.edit({ content: resultMessage });

      npmlog.info("Revolt", "Clone command completed successfully");
    } catch (error) {
      npmlog.error("Revolt", "Error during clone command");
      npmlog.error("Revolt", error);

      await message.reply(
        `❌ Error during cloning: ${error.message}\n\nCheck the bot logs for more details.`
      );
    }
  }
}
