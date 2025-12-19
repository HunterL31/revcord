import { Client as DiscordClient, MessageReaction, PartialMessageReaction, User, PartialUser, TextChannel } from "discord.js";
import { Client as RevoltClient } from "revolt.js";
import npmlog from "npmlog";
import { Main } from "./Main";
import { ClientboundNotification } from "revolt.js/dist/websocket/notifications";

/**
 * Handle a Discord reaction being added and mirror it to Revolt
 */
export async function handleDiscordReactionAdd(
  revolt: RevoltClient,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
) {
  try {
    // Ignore bot reactions to prevent loops
    if (user.bot) return;

    // Find the cached message mapping
    const cachedMessage = Main.discordCache.find(
      (cached) => cached.parentMessage === reaction.message.id
    );

    if (!cachedMessage) {
      // Message not in cache, can't mirror reaction
      return;
    }

    // Find the channel mapping
    const target = Main.mappings.find(
      (mapping) => mapping.discord === reaction.message.channelId
    );

    if (!target) return;

    // Get the Revolt channel and message
    let revoltChannel = revolt.channels.get(target.revolt);
    if (!revoltChannel) {
      try {
        revoltChannel = await revolt.channels.fetch(target.revolt);
      } catch {
        return;
      }
    }

    const revoltMessage = await revoltChannel.fetchMessage(cachedMessage.createdMessage);
    if (!revoltMessage) return;

    // Convert emoji to Revolt format
    const emoji = reaction.emoji;
    let revoltEmoji: string | null = null;

    if (emoji.id) {
      // Custom Discord emoji - use emoji sync manager to upload it to Revolt
      if (Main.emojiSyncManager) {
        const isAnimated = emoji.animated ?? false;
        revoltEmoji = await Main.emojiSyncManager.syncEmoji(
          emoji.id,
          emoji.name ?? "emoji",
          isAnimated,
          target.revolt
        );

        if (revoltEmoji) {
          npmlog.info("Reactions", `Synced custom emoji ${emoji.name} for reaction`);
        } else {
          npmlog.warn("Reactions", `Failed to sync custom emoji ${emoji.name} for reaction`);
          return;
        }
      } else {
        npmlog.info("Reactions", `Skipping custom emoji reaction (no emoji sync manager): ${emoji.name}`);
        return;
      }
    } else {
      // Unicode emoji - use directly
      revoltEmoji = emoji.name!;
    }

    // Add reaction to Revolt message
    await revoltMessage.react(revoltEmoji);
    npmlog.info("Reactions", `Mirrored reaction ${emoji.name} from Discord to Revolt`);
  } catch (e) {
    npmlog.error("Reactions", "Failed to mirror Discord reaction to Revolt");
    npmlog.error("Reactions", e);
  }
}

/**
 * Handle a Discord reaction being removed and mirror it to Revolt
 */
export async function handleDiscordReactionRemove(
  revolt: RevoltClient,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
) {
  try {
    // Ignore bot reactions to prevent loops
    if (user.bot) return;

    // Find the cached message mapping
    const cachedMessage = Main.discordCache.find(
      (cached) => cached.parentMessage === reaction.message.id
    );

    if (!cachedMessage) return;

    // Find the channel mapping
    const target = Main.mappings.find(
      (mapping) => mapping.discord === reaction.message.channelId
    );

    if (!target) return;

    // Get the Revolt channel and message
    let revoltChannel = revolt.channels.get(target.revolt);
    if (!revoltChannel) {
      try {
        revoltChannel = await revolt.channels.fetch(target.revolt);
      } catch {
        return;
      }
    }

    const revoltMessage = await revoltChannel.fetchMessage(cachedMessage.createdMessage);
    if (!revoltMessage) return;

    // Convert emoji
    const emoji = reaction.emoji;
    let revoltEmoji: string | null = null;

    if (emoji.id) {
      // Custom Discord emoji - use emoji sync manager to get the Revolt emoji ID
      // The emoji should already be synced from when it was added
      if (Main.emojiSyncManager) {
        const isAnimated = emoji.animated ?? false;
        revoltEmoji = await Main.emojiSyncManager.syncEmoji(
          emoji.id,
          emoji.name ?? "emoji",
          isAnimated,
          target.revolt
        );

        if (!revoltEmoji) {
          npmlog.warn("Reactions", `Cannot remove reaction - custom emoji ${emoji.name} not synced`);
          return;
        }
      } else {
        return;
      }
    } else {
      revoltEmoji = emoji.name!;
    }

    // Remove reaction from Revolt message
    await revoltMessage.unreact(revoltEmoji);
    npmlog.info("Reactions", `Removed reaction ${emoji.name} from Revolt (mirrored from Discord)`);
  } catch (e) {
    npmlog.error("Reactions", "Failed to remove reaction from Revolt");
    npmlog.error("Reactions", e);
  }
}

/**
 * Handle Revolt reaction packets and mirror to Discord
 */
export async function handleRevoltReactionPacket(
  discord: DiscordClient,
  revolt: RevoltClient,
  packet: ClientboundNotification
) {
  try {
    if (packet.type !== "MessageReact" && packet.type !== "MessageUnreact") {
      return;
    }

    const { id: messageId, channel_id, user_id, emoji_id } = packet;

    // Ignore bot's own reactions to prevent loops
    if (user_id === revolt.user?._id) return;

    // Find the cached message mapping (Revolt -> Discord)
    const cachedMessage = Main.revoltCache.find(
      (cached) => cached.parentMessage === messageId
    );

    if (!cachedMessage) {
      // Message not in cache, can't mirror
      return;
    }

    // Find the channel mapping
    const target = Main.mappings.find(
      (mapping) => mapping.revolt === channel_id
    );

    if (!target) return;

    // Get the Discord channel
    const discordChannel = await discord.channels.fetch(target.discord);
    if (!(discordChannel instanceof TextChannel)) return;

    // Fetch the Discord message
    const discordMessage = await discordChannel.messages.fetch(cachedMessage.createdMessage);
    if (!discordMessage) return;

    // Convert Revolt emoji to Discord format
    // Revolt uses Unicode directly or custom emoji IDs
    let discordEmoji: string;

    // Check if it's a custom Revolt emoji (ULID format) or Unicode
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(emoji_id)) {
      // Custom Revolt emoji - skip for now as Discord won't have it
      npmlog.info("Reactions", `Skipping custom Revolt emoji reaction: ${emoji_id}`);
      return;
    } else {
      // Unicode emoji
      discordEmoji = emoji_id;
    }

    if (packet.type === "MessageReact") {
      await discordMessage.react(discordEmoji);
      npmlog.info("Reactions", `Mirrored reaction ${discordEmoji} from Revolt to Discord`);
    } else {
      // MessageUnreact - remove bot's reaction if it exists
      const botReaction = discordMessage.reactions.cache.find(
        (r) => r.emoji.name === discordEmoji && r.me
      );
      if (botReaction) {
        await botReaction.users.remove(discord.user!.id);
        npmlog.info("Reactions", `Removed reaction ${discordEmoji} from Discord (mirrored from Revolt)`);
      }
    }
  } catch (e) {
    npmlog.error("Reactions", "Failed to mirror Revolt reaction to Discord");
    npmlog.error("Reactions", e);
  }
}

