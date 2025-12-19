import { Client as RevoltClient } from 'revolt.js';
import npmlog from 'npmlog';
import { fetch, FormData } from 'undici';

export interface EmojiCacheEntry {
  discordId: string;
  discordName: string;
  revoltId: string;
  serverId: string;
  timestamp: number;
}

interface EmojiUploadResult {
  success: boolean;
  revoltEmojiId?: string;
  error?: string;
}

interface RevoltEmojiUploadResponse {
  _id: string;
}

export class EmojiSyncManager {
  private emojiCache: Map<string, EmojiCacheEntry>;
  private uploadTimeouts: Map<string, NodeJS.Timeout>;
  private readonly CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly UPLOAD_TIMEOUT_MS = 15000;
  private readonly MAX_EMOJI_SIZE_MB = 5;

  constructor(
    private revolt: RevoltClient,
    private autumnUrl: string,
    private botToken: string
  ) {
    this.emojiCache = new Map();
    this.uploadTimeouts = new Map();
  }

  /**
   * Get the Revolt server ID from a channel ID
   */
  private async getServerIdFromChannel(channelId: string): Promise<string | null> {
    try {
      let channel = this.revolt.channels.get(channelId);
      if (!channel) {
        channel = await this.revolt.channels.fetch(channelId);
      }
      
      // Check if channel has server property
      if ('server_id' in channel && channel.server_id) {
        return channel.server_id;
      }
      
      return null;
    } catch (error) {
      npmlog.error('EmojiSync', `Failed to get server ID from channel ${channelId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if an emoji is already cached and valid
   */
  private getCachedEmoji(discordEmojiId: string, serverId: string): EmojiCacheEntry | null {
    const cacheKey = `${serverId}:${discordEmojiId}`;
    const cached = this.emojiCache.get(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.CACHE_EXPIRY_MS) {
      this.emojiCache.delete(cacheKey);
      return null;
    }
    
    return cached;
  }

  /**
   * Cache an emoji mapping
   */
  private cacheEmoji(entry: EmojiCacheEntry): void {
    const cacheKey = `${entry.serverId}:${entry.discordId}`;
    this.emojiCache.set(cacheKey, entry);
  }

  /**
   * Download Discord emoji image
   */
  private async downloadDiscordEmoji(emojiId: string, isAnimated: boolean): Promise<ArrayBuffer | null> {
    try {
      // Discord emojis: PNG for static, GIF for animated
      const extension = isAnimated ? 'gif' : 'png';
      const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}?size=128&quality=lossless`;
      
      npmlog.info('EmojiSync', `Downloading Discord emoji: ${emojiId}`);
      
      const response = await fetch(emojiUrl, {
        signal: AbortSignal.timeout(this.UPLOAD_TIMEOUT_MS)
      });
      
      if (!response.ok) {
        npmlog.error('EmojiSync', `Failed to download emoji ${emojiId}: ${response.status}`);
        return null;
      }
      
      const buffer = await response.arrayBuffer();
      
      // Check size
      const sizeMB = buffer.byteLength / (1024 * 1024);
      if (sizeMB > this.MAX_EMOJI_SIZE_MB) {
        npmlog.error('EmojiSync', `Emoji ${emojiId} too large: ${sizeMB.toFixed(1)}MB`);
        return null;
      }
      
      npmlog.info('EmojiSync', `Downloaded emoji ${emojiId} (${sizeMB.toFixed(2)}MB)`);
      return buffer;
    } catch (error) {
      npmlog.error('EmojiSync', `Error downloading emoji ${emojiId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Upload emoji to Revolt server
   */
  private async uploadEmojiToRevolt(
    serverId: string,
    emojiName: string,
    imageBuffer: ArrayBuffer,
    contentType: string
  ): Promise<RevoltEmojiUploadResponse | null> {
    try {
      const formData = new FormData();
      const uint8Array = new Uint8Array(imageBuffer);
      const blob = new Blob([uint8Array], { type: contentType });
      formData.append('name', emojiName);
      formData.append('emoji', blob, `${emojiName}.${contentType.split('/')[1]}`);
      
      npmlog.info('EmojiSync', `Uploading emoji "${emojiName}" to Revolt server ${serverId}`);
      
      const response = await fetch(
        `${this.autumnUrl}/custom/emoji/${serverId}`,
        {
          method: 'PUT',
          headers: {
            'x-bot-token': this.botToken,
          },
          body: formData,
          signal: AbortSignal.timeout(this.UPLOAD_TIMEOUT_MS)
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        npmlog.error('EmojiSync', `Failed to upload emoji: ${response.status} ${response.statusText} - ${errorText}`);
        return null;
      }
      
      const result = await response.json() as RevoltEmojiUploadResponse;
      
      if (!result._id) {
        npmlog.error('EmojiSync', 'Upload response missing emoji ID');
        return null;
      }
      
      npmlog.info('EmojiSync', `✅ Successfully uploaded emoji "${emojiName}" -> ${result._id}`);
      return result;
    } catch (error) {
      npmlog.error('EmojiSync', `Error uploading emoji to Revolt: ${error.message}`);
      return null;
    }
  }

  /**
   * Sync a Discord emoji to Revolt
   * @param discordEmojiId Discord emoji ID
   * @param emojiName Emoji name
   * @param isAnimated Whether the emoji is animated
   * @param revoltChannelId Revolt channel ID (to get server ID)
   * @returns Revolt emoji ID if successful, null otherwise
   */
  async syncEmoji(
    discordEmojiId: string,
    emojiName: string,
    isAnimated: boolean,
    revoltChannelId: string
  ): Promise<string | null> {
    try {
      // Get server ID
      const serverId = await this.getServerIdFromChannel(revoltChannelId);
      if (!serverId) {
        npmlog.warn('EmojiSync', `Cannot sync emoji: channel ${revoltChannelId} is not in a server`);
        return null;
      }
      
      // Check cache first
      const cached = this.getCachedEmoji(discordEmojiId, serverId);
      if (cached) {
        npmlog.info('EmojiSync', `Using cached emoji: ${emojiName} (${discordEmojiId}) -> ${cached.revoltId}`);
        return cached.revoltId;
      }
      
      // Download emoji from Discord
      const imageBuffer = await this.downloadDiscordEmoji(discordEmojiId, isAnimated);
      if (!imageBuffer) {
        return null;
      }
      
      // Determine content type
      const contentType = isAnimated ? 'image/gif' : 'image/png';
      
      // Sanitize emoji name (Revolt allows alphanumeric and underscores)
      const sanitizedName = emojiName.replace(/[^a-zA-Z0-9_]/g, '_');
      
      // Upload to Revolt
      const uploadResult = await this.uploadEmojiToRevolt(
        serverId,
        sanitizedName,
        imageBuffer,
        contentType
      );
      
      if (!uploadResult) {
        return null;
      }
      
      // Cache the result
      const cacheEntry: EmojiCacheEntry = {
        discordId: discordEmojiId,
        discordName: emojiName,
        revoltId: uploadResult._id,
        serverId,
        timestamp: Date.now()
      };
      this.cacheEmoji(cacheEntry);
      
      return uploadResult._id;
    } catch (error) {
      npmlog.error('EmojiSync', `Failed to sync emoji ${emojiName} (${discordEmojiId}): ${error.message}`);
      return null;
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.emojiCache.entries()) {
      if (now - entry.timestamp > this.CACHE_EXPIRY_MS) {
        this.emojiCache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: EmojiCacheEntry[] } {
    return {
      size: this.emojiCache.size,
      entries: Array.from(this.emojiCache.values())
    };
  }
}

/**
 * Factory function to create EmojiSyncManager
 */
export function createEmojiSyncManager(revolt: RevoltClient): EmojiSyncManager {
  const autumnUrl = process.env.REVOLT_ATTACHMENT_URL || 'https://autumn.revolt.chat';
  const botToken = process.env.REVOLT_TOKEN || '';
  
  if (!botToken) {
    throw new Error('REVOLT_TOKEN is required for emoji syncing');
  }
  
  return new EmojiSyncManager(revolt, autumnUrl, botToken);
}
