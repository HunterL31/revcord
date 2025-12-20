import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { DiscordCommand } from "../interfaces";
import UniversalExecutor from "../universalExecutor";
import npmlog from "npmlog";
import { cleanupStaleMappings } from "../util/cleanup";

export class CleanupCommand implements DiscordCommand {
  data = new SlashCommandBuilder()
    .setName("cleanup")
    .setDescription("Remove stale channel mappings where channels no longer exist")
    .setDefaultMemberPermissions(0); // Administrator only

  async execute(interaction: CommandInteraction, executor: UniversalExecutor) {
    try {
      await interaction.deferReply();

      await interaction.editReply({
        content: `🧹 Starting cleanup of stale channel mappings...`,
      });

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

      await interaction.editReply({
        content: resultMessage,
      });

      npmlog.info("Discord", "Cleanup command completed successfully");
    } catch (error) {
      npmlog.error("Discord", "Error during cleanup command");
      npmlog.error("Discord", error);
      
      const errorMessage = `❌ Error during cleanup: ${error.message}`;
      
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }
}
