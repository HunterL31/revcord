import {
  Client as DiscordClient,
  Collection,
  Message as DiscordMessage,
  TextChannel,
  CategoryChannel,
  ChannelType,
  GuildChannel,
  Attachment,
} from "discord.js";
import { Client as RevoltClient } from "revolt.js";
import { Channel as RevoltChannel } from "revolt.js/dist/maps/Channels";
import { Message as RevoltMessage } from "revolt.js/dist/maps/Messages";
import npmlog from "npmlog";
import { Main } from "../Main";
import { initiateDiscordChannel } from "../discord";
import { MappingModel } from "../models/Mapping";
import { createFileUploader } from "./fileUpload";
import { loadImageUploadConfig } from "./config";

export interface CloneProgress {
  totalChannels: number;
  clonedChannels: number;
  totalMessages: number;
  copiedMessages: number;
  currentChannel?: string;
  errors: string[];
}

export interface CloneOptions {
  copyHistory: boolean;
  maxMessagesPerChannel?: number;
  serverId: string;
  targetRevoltServerId: string;
}

/**
 * Scans a Discord server and returns all text channels organized by category
 */
export async function scanDiscordServer(
  discord: DiscordClient,
  serverId: string
): Promise<Map<string, TextChannel[]>> {
  const guild = await discord.guilds.fetch(serverId);
  
  if (!guild) {
    throw new Error("Guild not found");
  }

  const channels = await guild.channels.fetch();
  const channelMap = new Map<string, TextChannel[]>();

  // Get channels without category
  const uncategorized: TextChannel[] = [];

  channels.forEach((channel) => {
    if (channel?.type === ChannelType.GuildText) {
      const textChannel = channel as TextChannel;
      
      if (!textChannel.parent) {
        uncategorized.push(textChannel);
      } else {
        const categoryName = textChannel.parent.name;
        if (!channelMap.has(categoryName)) {
          channelMap.set(categoryName, []);
        }
        channelMap.get(categoryName)!.push(textChannel);
      }
    }
  });

  if (uncategorized.length > 0) {
    channelMap.set("Uncategorized", uncategorized);
  }

  return channelMap;
}

/**
 * Clones a Discord channel structure to Revolt
 */
export async function cloneChannelStructure(
  discord: DiscordClient,
  revolt: RevoltClient,
  options: CloneOptions,
  progressCallback?: (progress: CloneProgress) => void
): Promise<CloneProgress> {
  const progress: CloneProgress = {
    totalChannels: 0,
    clonedChannels: 0,
    totalMessages: 0,
    copiedMessages: 0,
    errors: [],
  };

  try {
    // Get Discord server
    const discordGuild = await discord.guilds.fetch(options.serverId);
    if (!discordGuild) {
      throw new Error("Discord server not found");
    }

    // Get Revolt server
    const revoltServer = revolt.servers.get(options.targetRevoltServerId);
    if (!revoltServer) {
      throw new Error("Revolt server not found");
    }

    // Scan Discord channels
    const channelMap = await scanDiscordServer(discord, options.serverId);
    
    // Count total channels
    channelMap.forEach((channels) => {
      progress.totalChannels += channels.length;
    });

    npmlog.info("Cloner", `Found ${progress.totalChannels} channels to clone`);

    // Clone each category and its channels
    for (const [categoryName, channels] of channelMap.entries()) {
      npmlog.info("Cloner", `Processing category: ${categoryName}`);

      for (const discordChannel of channels) {
        progress.currentChannel = discordChannel.name;
        
        try {
          // Check if channel already exists on Revolt
          let revoltChannel = Array.from(revolt.channels.values()).find(
            (ch) =>
              ch.channel_type === "TextChannel" &&
              ch.server_id === options.targetRevoltServerId &&
              ch.name?.toLowerCase() === discordChannel.name.toLowerCase()
          );

          // Create channel if it doesn't exist
          if (!revoltChannel) {
            npmlog.info(
              "Cloner",
              `Creating channel: ${discordChannel.name}`
            );

            const channelData = await revoltServer.createChannel({
              type: "Text",
              name: discordChannel.name,
              description: discordChannel.topic || undefined,
            });

            // Fetch the channel from client cache or server
            revoltChannel = revolt.channels.get(channelData._id);
            if (!revoltChannel) {
              // Channel not in cache yet, fetch it from server
              revoltChannel = await revolt.channels.fetch(channelData._id);
            }

            npmlog.info(
              "Cloner",
              `Created Revolt channel: ${revoltChannel.name} (${revoltChannel._id})`
            );
          } else {
            npmlog.info(
              "Cloner",
              `Channel already exists: ${revoltChannel.name}`
            );
          }

          // Create mapping between Discord and Revolt channels
          const existingMapping = Main.mappings.find(
            (mapping) =>
              mapping.discord === discordChannel.id ||
              mapping.revolt === revoltChannel._id
          );

          if (!existingMapping) {
            const mapping = {
              discord: discordChannel.id,
              revolt: revoltChannel._id,
              allowBots: true,
            };

            // Setup webhook
            await initiateDiscordChannel(discordChannel, mapping);

            // Save to database
            await MappingModel.create({
              discordChannel: discordChannel.id,
              revoltChannel: revoltChannel._id,
              discordChannelName: discordChannel.name,
              revoltChannelName: revoltChannel.name,
              allowBots: true,
            });

            // Add to memory
            Main.mappings.push(mapping);

            npmlog.info(
              "Cloner",
              `Connected ${discordChannel.name} <-> ${revoltChannel.name}`
            );
          }

          progress.clonedChannels++;

          // Copy message history if requested
          if (options.copyHistory) {
            const messageCount = await copyChannelHistory(
              discordChannel,
              revoltChannel,
              revolt,
              options.maxMessagesPerChannel
            );
            progress.copiedMessages += messageCount;
            progress.totalMessages += messageCount;
          }

          if (progressCallback) {
            progressCallback(progress);
          }
        } catch (error) {
          const errorMsg = `Failed to clone channel ${discordChannel.name}: ${error.message}`;
          npmlog.error("Cloner", errorMsg);
          progress.errors.push(errorMsg);
        }

        // Rate limiting: small delay between channels
        await delay(1000);
      }
    }

    npmlog.info(
      "Cloner",
      `Cloning complete! ${progress.clonedChannels}/${progress.totalChannels} channels cloned`
    );
    
    if (options.copyHistory) {
      npmlog.info(
        "Cloner",
        `Copied ${progress.copiedMessages} messages`
      );
    }
  } catch (error) {
    npmlog.error("Cloner", `Cloning failed: ${error.message}`);
    progress.errors.push(`Critical error: ${error.message}`);
  }

  return progress;
}

/**
 * Copies message history from Discord channel to Revolt channel
 */
async function copyChannelHistory(
  discordChannel: TextChannel,
  revoltChannel: RevoltChannel,
  revolt: RevoltClient,
  maxMessages: number = 100
): Promise<number> {
  npmlog.info(
    "Cloner",
    `Copying message history for ${discordChannel.name}...`
  );

  let copiedCount = 0;

  try {
    // Fetch messages from Discord (they come in reverse chronological order)
    const messages: DiscordMessage[] = [];
    let lastId: string | undefined;
    let fetchCount = 0;
    const batchSize = 100; // Discord API limit

    while (fetchCount < maxMessages) {
      const fetchLimit = Math.min(batchSize, maxMessages - fetchCount);
      const batch = await discordChannel.messages.fetch({
        limit: fetchLimit,
        before: lastId,
      });

      if (batch.size === 0) break;

      messages.push(...batch.values());
      fetchCount += batch.size;
      lastId = batch.last()?.id;

      // Rate limiting
      await delay(500);
    }

    // Reverse to get chronological order
    messages.reverse();

    npmlog.info(
      "Cloner",
      `Fetched ${messages.length} messages from ${discordChannel.name}`
    );

    // Load image upload configuration
    const imageUploadConfig = loadImageUploadConfig();
    let fileUploader: any = null;
    
    if (imageUploadConfig.enabled) {
      try {
        fileUploader = createFileUploader();
      } catch (error) {
        npmlog.warn("Cloner", `Failed to initialize file uploader: ${error.message}`);
      }
    }

    // Send messages to Revolt
    for (const message of messages) {
      try {
        // Skip bot messages for cleaner history
        if (message.author.bot) continue;

        // Format message content
        let content = message.content || "";
        
        // Handle attachments with image upload support
        const attachmentIds: string[] = [];
        const failedAttachments = new Collection<string, Attachment>();
        
        if (message.attachments.size > 0) {
          for (const attachment of message.attachments.values()) {
            if (attachment.contentType?.startsWith('image/') && fileUploader) {
              try {
                npmlog.info('Cloner', `📷 Uploading image: ${attachment.name}`);
                
                const uploadResult = await fileUploader.uploadDiscordImageToRevolt(
                  attachment.url,
                  attachment.name,
                  attachment.contentType
                );

                if (uploadResult.success && uploadResult.fileId) {
                  attachmentIds.push(uploadResult.fileId);
                  npmlog.info('Cloner', `✅ Image uploaded for history: ${attachment.name}`);
                } else {
                  npmlog.warn('Cloner', `❌ Image upload failed: ${attachment.name} - ${uploadResult.error}`);
                  // Fallback to URL if upload fails
                  if (imageUploadConfig.fallbackToUrl) {
                    failedAttachments.set(attachment.id, attachment);
                  }
                }
                
                // Rate limiting for uploads
                await delay(500);
              } catch (error) {
                npmlog.warn('Cloner', `Image upload error for ${attachment.name}: ${error.message}`);
                if (imageUploadConfig.fallbackToUrl) {
                  failedAttachments.set(attachment.id, attachment);
                }
              }
            } else {
              // Non-image files or upload disabled: add to failed collection for URL fallback
              failedAttachments.set(attachment.id, attachment);
            }
          }
          
          // Add failed attachments as URLs
          failedAttachments.forEach((attachment) => {
            content += `\n📎 ${attachment.name}: ${attachment.url}`;
          });
        }

        // Skip empty messages with no content or attachments
        if (!content.trim() && attachmentIds.length === 0) continue;

        // Send to Revolt with masquerade and attachments
        await revoltChannel.sendMessage({
          content: content.substring(0, 2000), // Revolt's message limit
          attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
          masquerade: {
            name: `${message.author.username}${
              message.author.discriminator !== "0"
                ? "#" + message.author.discriminator
                : ""
            }`,
            avatar: message.author.avatarURL() || undefined,
          },
        } as any);

        copiedCount++;

        // Rate limiting to avoid overwhelming Revolt API
        await delay(1000);
      } catch (error) {
        npmlog.warn(
          "Cloner",
          `Failed to copy message ${message.id}: ${error.message}`
        );
      }
    }

    npmlog.info(
      "Cloner",
      `Copied ${copiedCount} messages to ${revoltChannel.name}`
    );
  } catch (error) {
    npmlog.error(
      "Cloner",
      `Failed to copy history for ${discordChannel.name}: ${error.message}`
    );
  }

  return copiedCount;
}

/**
 * Utility function to delay execution
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get a summary of channels that would be cloned
 */
export async function getCloneSummary(
  discord: DiscordClient,
  serverId: string
): Promise<string> {
  const channelMap = await scanDiscordServer(discord, serverId);
  
  let summary = "**Discord Server Clone Summary**\n\n";
  let totalChannels = 0;

  channelMap.forEach((channels, categoryName) => {
    summary += `**${categoryName}** (${channels.length} channels)\n`;
    channels.forEach((channel) => {
      summary += `  • ${channel.name}\n`;
    });
    summary += "\n";
    totalChannels += channels.length;
  });

  summary += `\n**Total channels to clone: ${totalChannels}**`;
  
  return summary;
}
