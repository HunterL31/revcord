import { Client as DiscordClient } from "discord.js";
import { Client as RevoltClient } from "revolt.js";
import npmlog from "npmlog";
import { Main } from "../Main";
import { MappingModel } from "../models/Mapping";
import { unregisterDiscordChannel } from "../discord";
import { TextChannel } from "discord.js";

/**
 * Clean up stale mappings where channels no longer exist
 */
export async function cleanupStaleMappings(
  discord: DiscordClient,
  revolt: RevoltClient
): Promise<{ cleaned: number; errors: string[] }> {
  npmlog.info("Cleanup", "Starting stale mapping cleanup...");
  
  const errors: string[] = [];
  let cleaned = 0;
  
  // Get all mappings from database
  const allMappings = await MappingModel.findAll();
  
  for (const mapping of allMappings) {
    let shouldRemove = false;
    let reason = "";
    
    try {
      // Check if Discord channel exists
      try {
        await discord.channels.fetch(mapping.discordChannel);
      } catch (discordError) {
        if (discordError.message.includes('404') || discordError.message.includes('not found')) {
          shouldRemove = true;
          reason = `Discord channel ${mapping.discordChannel} no longer exists`;
        }
      }
      
      // Check if Revolt channel exists
      if (!shouldRemove) {
        try {
          await revolt.channels.fetch(mapping.revoltChannel);
        } catch (revoltError) {
          if (revoltError.message.includes('404') || revoltError.message.includes('not found')) {
            shouldRemove = true;
            reason = `Revolt channel ${mapping.revoltChannel} no longer exists`;
          }
        }
      }
      
      if (shouldRemove) {
        npmlog.info("Cleanup", `Removing stale mapping: ${reason}`);
        
        // Remove from database
        await MappingModel.destroy({ where: { id: mapping.id } });
        
        // Remove from memory
        const memoryIndex = Main.mappings.findIndex(
          m => m.discord === mapping.discordChannel && m.revolt === mapping.revoltChannel
        );
        if (memoryIndex > -1) {
          Main.mappings.splice(memoryIndex, 1);
        }
        
        // Try to clean up webhook
        try {
          const discordChannel = await discord.channels.fetch(mapping.discordChannel);
          if (discordChannel instanceof TextChannel) {
            await unregisterDiscordChannel(discordChannel, {
              discord: mapping.discordChannel,
              revolt: mapping.revoltChannel,
              allowBots: mapping.allowBots
            });
          }
        } catch (webhookError) {
          // Webhook cleanup failed, but that's okay since the channel might be deleted
          npmlog.warn("Cleanup", `Failed to clean up webhook for ${mapping.discordChannel}: ${webhookError.message}`);
        }
        
        cleaned++;
      }
      
    } catch (error) {
      const errorMsg = `Error checking mapping ${mapping.discordChannel} <-> ${mapping.revoltChannel}: ${error.message}`;
      errors.push(errorMsg);
      npmlog.error("Cleanup", errorMsg);
    }
  }
  
  npmlog.info("Cleanup", `Cleanup complete. Removed ${cleaned} stale mappings, ${errors.length} errors`);
  
  return { cleaned, errors };
}
