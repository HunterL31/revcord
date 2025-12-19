import {
  Channel,
  Client as DiscordClient,
  Collection,
  Message,
  MessageMentions,
  TextChannel,
  Attachment,
} from "discord.js";
import npmlog from "npmlog";
import { Client as RevoltClient } from "revolt.js";
import { Main } from "./Main";
import { Mapping, PartialDiscordMessage, ReplyObject } from "./interfaces";
import {
  DiscordChannelPattern,
  DiscordEmojiPattern,
  DiscordPingPattern,
  TrailingNewlines,
} from "./util/regex";
import { RevcordEmbed } from "./util/embeds";
import { checkWebhookPermissions } from "./util/permissions";
import { truncate } from "./util/truncate";
import { createFileUploader } from "./util/fileUpload";
import { loadImageUploadConfig, loadEmojiSyncConfig } from "./util/config";
import { MappingModel } from "./models/Mapping";

/**
 * This file contains code taking care of things from Discord to Revolt
 * Discord => Revolt
 */

/**
 * Format a Discord message with all attachments to Revolt-friendly format
 * @param attachments message.attachments
 * @param content message.content
 * @param ping ID of the user to ping
 * @returns Formatted string
 */
async function formatMessage(
  attachments: Collection<string, Attachment>,
  content: string,
  mentions: MessageMentions,
  revoltChannelId?: string,
  stickerUrl?: string
) {
  let messageString = "";

  // Handle emojis
  const emojis = content.match(DiscordEmojiPattern);
  if (emojis) {
    // Process emojis sequentially to maintain order
    for (let i = 0; i < emojis.length; i++) {
      const emoji = emojis[i];
      const dissected = DiscordEmojiPattern.exec(emoji);

      // reset internal pointer... what is that even
      DiscordEmojiPattern.lastIndex = 0;

      if (dissected !== null) {
        const emojiName = dissected.groups["name"];
        const emojiId = dissected.groups["id"];
        const isAnimated = dissected[1] === "a:";

        if (emojiName && emojiId) {
          // Try to sync emoji to Revolt if emoji sync is enabled and channel ID is provided
          let replaced = false;
          const emojiSyncConfig = loadEmojiSyncConfig();
          
          if (emojiSyncConfig.enabled && Main.emojiSyncManager && revoltChannelId) {
            try {
              const revoltEmojiId = await Main.emojiSyncManager.syncEmoji(
                emojiId,
                emojiName,
                isAnimated,
                revoltChannelId
              );

              if (revoltEmojiId) {
                // Successfully synced - use Revolt emoji syntax
                content = content.replace(emoji, `:${revoltEmojiId}:`);
                replaced = true;
                npmlog.info(
                  "Discord",
                  `Synced emoji ${emojiName} (${emojiId}) -> :${revoltEmojiId}:`
                );
              }
            } catch (error) {
              npmlog.warn(
                "Discord",
                `Failed to sync emoji ${emojiName} (${emojiId}): ${error.message}`
              );
            }
          }

          // Fallback to link format if sync failed or is disabled
          if (!replaced && emojiSyncConfig.fallbackToLink) {
            let emojiUrl: string;

            // Limit displayed emojis to 5 to reduce spam
            if (i < 5) {
              emojiUrl =
                "https://cdn.discordapp.com/emojis/" +
                emojiId +
                ".webp?size=32&quality=lossless";
            }
            content = content.replace(emoji, `[:${emojiName}:](${emojiUrl})`);
          }
        }
      }
    }
  }

  // Handle pings
  const pings = content.match(DiscordPingPattern);
  if (pings) {
    for (const ping of pings) {
      const matched = DiscordPingPattern.exec(ping);
      // reset internal pointer because i'm too lazy to figure out however it works
      DiscordPingPattern.lastIndex = 0;

      // Extract the mentioned member's ID from ping string
      if (matched !== null) {
        const id = matched.groups["id"];

        if (id) {
          // Find the member among mentions by ID
          const match = mentions.members.find((member) => member.id === id);

          // Why? Because if a user is mentioned twice,
          // mentions collection contains only the first mention.

          if (match) {
            content = content.replace(
              ping,
              `[@${match.user.username}#${match.user.discriminator}]()`
            );
          }
        }
      }
    }
  }

  // Handle channel mentions
  const channelMentions = content.match(DiscordChannelPattern);
  if (channelMentions) {
    for (const [index, mention] of channelMentions.entries()) {
      const match = mentions.channels.at(index);

      if (match && match instanceof TextChannel) {
        content = content.replace(mention, "#" + match.name);
      }
    }
  }

  messageString += content + "\n";

  attachments.forEach((attachment) => {
    messageString += attachment.url + "\n";
  });

  if (stickerUrl) messageString += stickerUrl + "\n";

  messageString = messageString.replace(TrailingNewlines, "");

  return messageString;
}

/**
 * Find a relevant mapping and direct a Discord message to Revolt
 * @param revolt Revolt client
 * @param discord Discord client
 * @param message Discord message object
 */
export async function handleDiscordMessage(
  revolt: RevoltClient,
  discord: DiscordClient,
  message: Message
) {
  console.log(message);
  try {
    // Find target Revolt channel
    const target = Main.mappings.find(
      (mapping) => mapping.discord === message.channelId
    );

    // Bot check
    if (
      target &&
      message.applicationId !== discord.user.id &&
      (!message.author.bot || target.allowBots)
    ) {
      // Prepare masquerade
      const mask = {
        // Support for new username system
        name: truncate(
          message.author.username +
            (message.author.discriminator.length === 1
              ? ""
              : "#" + message.author.discriminator),
          32
        ),
        avatar: message.author.avatarURL(),
      };
      // Handle replies
      const reference = message.reference;
      let replyPing: string;

      let replyEmbed: ReplyObject;

      if (reference && message.messageSnapshots.size === 0) {
        // Find cross-platform replies
        const crossPlatformReference = Main.revoltCache.find(
          (cached) => cached.createdMessage === reference.messageId
        );

        if (crossPlatformReference) {
          replyPing = crossPlatformReference.parentMessage;
        } else {
          // Find same-platform replies
          const samePlatformReference = Main.discordCache.find(
            (cached) => cached.parentMessage === reference.messageId
          );

          if (samePlatformReference) {
            replyPing = samePlatformReference.createdMessage;
          } else {
            // Fallback - this happens when someone replies to a message
            // that was sent before the bot was started

            // Wrap in another try-catch since it may fail
            // if the bot doesn't have permission to view message history
            try {
              // Fetch referenced message
              const sourceChannel = await discord.channels.fetch(
                message.reference.channelId
              );

              if (sourceChannel instanceof TextChannel) {
                const referenced = await sourceChannel.messages.fetch(
                  message.reference.messageId
                );

                // Prepare reply embed
                const formattedContent = await formatMessage(
                  referenced.attachments,
                  referenced.content,
                  referenced.mentions,
                  target.revolt
                );

                replyEmbed = {
                  pingable: false,
                  entity:
                    referenced.author.username +
                    "#" +
                    referenced.author.discriminator,
                  entityImage: referenced.author.avatarURL(),
                  content: formattedContent,
                  attachments: [],
                  embedType: "reply",
                };

                if (referenced.attachments.first()) {
                  replyEmbed.attachments.push("file");
                  replyEmbed.previewAttachment =
                    referenced.attachments.first().url;
                }
              }
            } catch (e) {
              npmlog.warn(
                "Discord",
                'Bot lacks the "View message history" permission.'
              );
              npmlog.warn("Discord", e);
            }
          }
        }
      }

      // Contains forwarded message
      if (message.messageSnapshots.size > 0) {
        const referenced = message.messageSnapshots.at(0);

        // Prepare reply embed
        const formattedContent = await formatMessage(
          referenced.attachments,
          referenced.content,
          referenced.mentions,
          target.revolt
        );

        replyEmbed = {
          pingable: false,
          content: formattedContent,
          attachments: [],
          embedType: "forward",
        };

        if (referenced.attachments.first()) {
          replyEmbed.attachments.push("file");
          replyEmbed.previewAttachment = referenced.attachments.first().url;
        }
      }

      // Sticker
      const sticker = message.stickers.first();
      let stickerUrl = sticker && sticker.url;

      // NEW: Handle image uploads to Revolt first
      const imageUploadConfig = loadImageUploadConfig();
      const attachmentIds: string[] = [];
      const failedAttachments = new Collection<string, Attachment>();
      let hasUploadErrors = false;

      if (message.attachments.size > 0 && imageUploadConfig.enabled) {
        try {
          const fileUploader = createFileUploader();
          
          for (const attachment of message.attachments.values()) {
            if (attachment.contentType?.startsWith('image/')) {
              npmlog.info('Discord', `🖼️ Uploading image: ${attachment.name} (${(attachment.size / 1024 / 1024).toFixed(1)}MB)`);
              
              const uploadResult = await fileUploader.uploadDiscordImageToRevolt(
                attachment.url,
                attachment.name,
                attachment.contentType
              );

              if (uploadResult.success && uploadResult.fileId) {
                attachmentIds.push(uploadResult.fileId);
                npmlog.info('Discord', `✅ Image uploaded: ${attachment.name} -> ${uploadResult.fileId}`);
                // Successfully uploaded - don't add to failedAttachments
              } else {
                npmlog.warn('Discord', `❌ Image upload failed: ${attachment.name} - ${uploadResult.error}`);
                hasUploadErrors = true;
                
                // Add failed uploads to collection if fallback enabled
                if (imageUploadConfig.fallbackToUrl) {
                  failedAttachments.set(attachment.id, attachment);
                }
              }
            } else {
              // Non-image files: always add to failed collection so URLs are shown
              failedAttachments.set(attachment.id, attachment);
            }
          }
        } catch (error) {
          npmlog.error('Discord', 'Error during image upload process:', error);
          // On error, add all attachments to failed collection
          message.attachments.forEach((att) => failedAttachments.set(att.id, att));
          hasUploadErrors = true;
        }
      } else {
        // If upload disabled or no attachments, all attachments become URLs
        message.attachments.forEach((att) => failedAttachments.set(att.id, att));
      }

      // Format message content (parse emojis, mentions, and only failed/non-image attachments)
      let messageString = await formatMessage(
        failedAttachments,
        message.content,
        message.mentions,
        target.revolt,
        stickerUrl
      );

      // Prepare message object
      // revolt.js doesn't support masquerade yet, but we can use them using this messy trick.
      const messageObject = {
        content: truncate(messageString, 1984),
        masquerade: mask,
        attachments: attachmentIds.length > 0 ? attachmentIds : undefined, // NEW: Add uploaded files
        replies: replyPing
          ? [
              {
                id: replyPing,
                mention: false,
              },
            ]
          : [],
      } as any;

      if (replyEmbed) {
        if (typeof messageObject.embeds === "undefined")
          messageObject.embeds = [];
        messageObject.embeds.push({
          type: "Text",
          icon_url: replyEmbed.entityImage,
          title: replyEmbed.entity,
          description: `**${
            replyEmbed.embedType === "reply" ? "Reply to" : "Forwarded message"
          }**: ${replyEmbed.content}`,
        });
      }

      // Translate embeds, if present.
      // Allow embeds only from bots, since a regular user
      // shouldn't be able to send them.
      if (message.embeds.length && message.author.bot) {
        // Add an empty array
        if (typeof messageObject.embeds === "undefined")
          messageObject.embeds = [];

        // Translate embed
        try {
          const embed = new RevcordEmbed()
            .fromDiscord(message.embeds[0])
            .toRevolt();

          messageObject.embeds.push(embed);
        } catch (e) {
          npmlog.warn("Discord", "Failed to translate embed.");
          npmlog.warn("Discord", e);
        }
      }

      // Get or fetch the Revolt channel
      let revoltChannel = revolt.channels.get(target.revolt);
      if (!revoltChannel) {
        // Channel not in cache, fetch it from server
        try {
          revoltChannel = await revolt.channels.fetch(target.revolt);
        } catch (fetchError) {
          // Check if it's a 404 (channel doesn't exist)
          if (fetchError.message.includes('404') || fetchError.message.includes('not found')) {
            npmlog.warn("Discord", `Revolt channel ${target.revolt} no longer exists, removing stale mapping`);
            
            // Remove stale mapping from database
            await MappingModel.destroy({ where: { revoltChannel: target.revolt } });
            
            // Remove from memory
            const mappingIndex = Main.mappings.findIndex(m => m.revolt === target.revolt);
            if (mappingIndex > -1) {
              Main.mappings.splice(mappingIndex, 1);
            }
            
            // Remove associated webhook
            try {
              const discordChannel = await discord.channels.fetch(message.channelId);
              if (discordChannel instanceof TextChannel) {
                await unregisterDiscordChannel(discordChannel, target);
              }
            } catch (webhookError) {
              npmlog.warn("Discord", `Failed to clean up webhook: ${webhookError.message}`);
            }
            
            npmlog.info("Discord", "Stale mapping cleaned up successfully");
            return; // Skip sending this message
          }
          
          throw new Error(`Failed to fetch Revolt channel ${target.revolt}: ${fetchError.message}`);
        }
      }
      
      const sentMessage = await revoltChannel.sendMessage(messageObject);

      // Save in cache
      Main.discordCache.push({
        parentMessage: message.id,
        parentAuthor: message.author.id,
        createdMessage: sentMessage._id,
        channelId: target.discord,
      });
    }
  } catch (e) {
    npmlog.warn("Revolt", "Couldn't send a message to Revolt");
    npmlog.warn("Revolt", e);

    if (
      "response" in e &&
      "status" in e.response &&
      e.response.status === 403
    ) {
      npmlog.error(
        "Revolt",
        "It seems the bot doesn't have enough permissions (most likely Masquerade)"
      );
    }
  }
}

/**
 * Handle Discord message update and update the relevant message in Revolt
 * @param revolt Revolt client
 * @param message PartialDiscordMessage object (oldMessage, just content from newMessage)
 */
export async function handleDiscordMessageUpdate(
  revolt: RevoltClient,
  message: PartialDiscordMessage
) {
  try {
    // Find target Revolt channel
    const target = Main.mappings.find(
      (mapping) => mapping.discord === message.channelId
    );

    if (target && (target.allowBots || !message.author.bot)) {
      const cachedMessage = Main.discordCache.find(
        (cached) => cached.parentMessage === message.id
      );

      if (cachedMessage) {
        const messageObject = {} as any;

        if (message.content.length > 0) {
          messageObject.content = await formatMessage(
            message.attachments,
            message.content,
            message.mentions,
            target.revolt
          );
        }

        if (message.embeds.length && message.author.bot) {
          if (typeof messageObject.embeds === "undefined")
            messageObject.embeds = [];

          try {
            const embed = new RevcordEmbed()
              .fromDiscord(message.embeds[0])
              .toRevolt();

            messageObject.embeds.push(embed);
          } catch (e) {
            npmlog.warn("Discord", "Failed to translate embed.");
            npmlog.warn("Discord", JSON.stringify(message.embeds[0]));
            npmlog.warn("Discord", e);
          }
        }

        // Get or fetch the Revolt channel
        let channel = revolt.channels.get(target.revolt);
        if (!channel) {
          // Channel not in cache, fetch it from server
          try {
            channel = await revolt.channels.fetch(target.revolt);
          } catch (fetchError) {
            throw new Error(`Failed to fetch Revolt channel ${target.revolt}: ${fetchError.message}`);
          }
        }
        
        const messageToEdit = await channel.fetchMessage(
          cachedMessage.createdMessage
        );

        await messageToEdit.edit(messageObject);
      }
    }
  } catch (e) {
    npmlog.error("Revolt", "Failed to edit message");
    npmlog.error("Discord", e);
  }
}

/**
 * Handle Discord message delete and delete the relevant message in Revolt
 * @param revolt Revolt client
 * @param messageId Deleted Discord message ID
 */
export async function handleDiscordMessageDelete(
  revolt: RevoltClient,
  messageId: string
) {
  const cachedMessage = Main.discordCache.find(
    (cached) => cached.parentMessage === messageId
  );

  if (cachedMessage) {
    try {
      const target = Main.mappings.find(
        (mapping) => mapping.discord === cachedMessage.channelId
      );

      if (target) {
        const channel = await revolt.channels.get(target.revolt);
        const messageToDelete = await channel.fetchMessage(
          cachedMessage.createdMessage
        );

        await messageToDelete.delete();

        // TODO remove from cache
      }
    } catch (e) {
      npmlog.error("Revolt", "Failed to delete message");
      npmlog.error("Revolt", e);
    }
  }
}

/**
 * Initialize webhook in a Discord channel
 * @param channel A Discord channel
 * @param mapping A mapping pair
 * @throws
 */
export async function initiateDiscordChannel(
  channel: Channel,
  mapping: Mapping
) {
  if (channel instanceof TextChannel) {
    await checkWebhookPermissions(channel);

    const webhooks = await channel.fetchWebhooks();

    // Try to find already created webhook
    let webhook = webhooks.find(
      (wh) => wh.name === "revcord-" + mapping.revolt
    );

    if (!webhook) {
      npmlog.info("Discord", "Creating webhook for Discord#" + channel.name);

      // No webhook found, create one
      webhook = await channel.createWebhook({
        name: `revcord-${mapping.revolt}`,
      });
    }

    Main.webhooks.push(webhook);
  }
}

/**
 * Unregister a Discord channel (when disconnecting)
 */
export async function unregisterDiscordChannel(
  channel: Channel,
  mapping: Mapping
) {
  if (channel instanceof TextChannel) {
    await checkWebhookPermissions(channel);

    const webhooks = await channel.fetchWebhooks();

    // Try to find created webhooks
    let webhook = webhooks.find(
      (wh) => wh.name === "revcord-" + mapping.revolt
    );

    npmlog.info("Discord", "Removing webhook for Discord#" + channel.name);

    // Remove the webhook
    if (webhook) {
      await webhook.delete();

      // Remove from memory
      const i = Main.webhooks.indexOf(webhook);
      Main.webhooks.splice(i, 1);
    }
  }
}
