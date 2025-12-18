import { RevoltCommand } from "../interfaces";
import UniversalExecutor from "../universalExecutor";
import { Message } from "revolt.js/dist/maps/Messages";
import npmlog from "npmlog";
import { cleanupStaleMappings } from "../util/cleanup";

export class CleanupCommand implements RevoltCommand {
  data = {
    name: "cleanup",
    description: "Remove stale channel mappings where channels no longer exist",
  };

  async execute(
    message: Message,
    args: string,
    executor: UniversalExecutor
  ): Promise<void> {
    
    if (message.channel.server.owner !== message.author_id) {
      await message.reply("Error! You don't have enough permissions (server owner only).");
      return;
    }

    try {
      await message.reply("🧹 Starting cleanup of stale channel mappings...");
      
      const result = await cleanupStaleMappings(
        executor.getDiscordClient(),
        executor.getRevoltClient()
      );
      
      let resultMessage = `✅ **Cleanup complete!**\n\n`;
      resultMessage += `Removed stale mappings: ${result.cleaned}\n`;
      
      if (result.errors.length > 0) {
        resultMessage += `\n⚠️ **Errors (${result.errors.length}):**\n`;
        result.errors.slice(0, 3).forEach((error) => {
          resultMessage += `• ${error}\n`;
        });
        if (result.errors.length > 3) {
          resultMessage += `• ... and ${result.errors.length - 3} more errors\n`;
        }
      }
      
      if (result.cleaned === 0 && result.errors.length === 0) {
        resultMessage += `\n🎉 No stale mappings found - everything looks good!`;
      }

      await message.reply(resultMessage);

      npmlog.info("Revolt", "Cleanup command completed successfully");
    } catch (error) {
      npmlog.error("Revolt", "Error during cleanup command");
      npmlog.error("Revolt", error);
      await message.reply(`❌ Error during cleanup: ${error.message}`);
    }
  }
}
