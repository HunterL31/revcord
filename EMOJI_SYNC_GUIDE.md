# Discord to Revolt Emoji Syncing Guide

## Overview

The emoji sync feature automatically handles Discord custom emojis when messages are bridged to Revolt. Instead of displaying emojis as plain text like `<:emojiname:164859>` or as image links, the bot now:

1. **Detects** Discord custom emojis in messages
2. **Downloads** the emoji image from Discord's CDN
3. **Uploads** it to the Revolt server as a custom emoji with the same name
4. **Replaces** the emoji syntax with the Revolt emoji reference

This creates a seamless experience where Discord emojis appear as proper custom emojis on Revolt!

## Features

- ✅ **Automatic syncing**: Emojis are synced on-the-fly when messages are sent
- ✅ **Caching**: Once synced, emojis are cached to avoid re-uploading
- ✅ **Animated emoji support**: Handles both static (PNG) and animated (GIF) emojis
- ✅ **Fallback handling**: If sync fails, falls back to image links
- ✅ **Configurable**: All aspects can be customized via environment variables

## How It Works

### 1. Message Processing

When a Discord message containing custom emojis is sent:

```
Discord message: "Hello <:wave:123456789> from Discord!"
```

### 2. Emoji Detection

The bot detects the custom emoji pattern: `<:wave:123456789>` or `<a:wave:123456789>` (for animated)

### 3. Download & Upload (Two-Step Process)

1. Downloads the emoji from: `https://cdn.discordapp.com/emojis/123456789.png`
2. Uploads file to Autumn: `POST /emojis` → returns `{ id: "file_id" }`
3. Creates emoji in Delta: `PUT /custom/emoji/{file_id}` with server parent info

### 4. Message Transformation

```
Revolt message: "Hello :uploaded_emoji_id: from Discord!"
```

The emoji now appears as a proper Revolt custom emoji!

## Configuration

### Basic Setup

Emoji syncing is **enabled by default**. No additional configuration is required!

### Environment Variables

Customize behavior with these optional variables in your `.env` file:

```env
# Enable/disable emoji syncing (default: true)
SYNC_EMOJIS_TO_REVOLT=true

# Maximum emoji file size in MB (default: 5)
# Discord emojis are typically 100-500KB
MAX_EMOJI_SIZE_MB=5

# Cache expiry in days (default: 7)
# Synced emojis are cached to avoid re-uploading
EMOJI_CACHE_EXPIRY_DAYS=7

# Fallback to image link if sync fails (default: true)
# If false, emojis that fail to sync will be removed from the message
EMOJI_FALLBACK_TO_LINK=true
```

### Advanced Configuration

**Required for self-hosted Revolt instances:**

```env
# Revolt API endpoint
API_URL=https://api.revolt.chat

# Revolt file storage endpoint (Autumn)
REVOLT_ATTACHMENT_URL=https://autumn.revolt.chat
```

## Requirements

### Permissions

The bot needs these permissions:

**On Discord:**
- Read Messages
- Send Messages
- View Message History

**On Revolt:**
- **Masquerade** (required for message sending)
- **Manage Server** (required for uploading custom emojis)

### Server Limits

- **Revolt servers** have a limit on the number of custom emojis (typically 100-200)
- If the server emoji limit is reached, new emojis will fail to upload
- Consider periodic cleanup of unused emojis

## Caching

### How Caching Works

1. When an emoji is synced, it's stored in memory with:
   - Discord emoji ID
   - Revolt emoji ID
   - Server ID
   - Timestamp

2. Cache entries expire after `EMOJI_CACHE_EXPIRY_DAYS` days

3. Cache is checked before attempting to sync:
   - If cached and valid → uses cached Revolt emoji ID
   - If not cached or expired → downloads and uploads again

### Cache Benefits

- **Faster message processing**: No need to re-upload existing emojis
- **Reduced API calls**: Saves bandwidth and rate limiting
- **Better performance**: Messages with cached emojis process instantly

## Troubleshooting

### Emoji Not Syncing

**Problem:** Discord emojis appear as links instead of custom emojis

**Solutions:**
1. Check that `SYNC_EMOJIS_TO_REVOLT=true` in `.env`
2. Verify the bot has "Manage Server" permission on Revolt
3. Check bot logs for error messages
4. Ensure the Revolt server hasn't reached its emoji limit

### "Failed to upload emoji" Error

**Common causes:**
1. **Server emoji limit reached**: Remove unused custom emojis from Revolt server
2. **Emoji too large**: Reduce `MAX_EMOJI_SIZE_MB` or check emoji file size
3. **Invalid emoji name**: Emoji names must be alphanumeric + underscores
4. **Network issues**: Check `REVOLT_ATTACHMENT_URL` is correct

### Animated Emojis Not Working

**Note:** Animated emojis are supported! Both `.gif` and `.png` formats work.

If animated emojis aren't working:
1. Check the emoji size isn't exceeding `MAX_EMOJI_SIZE_MB`
2. Verify Revolt server supports animated emojis (feature availability)
3. Check bot logs for specific error messages

### Emojis Syncing Multiple Times

This shouldn't happen due to caching, but if it does:
1. Check cache isn't being cleared too frequently
2. Increase `EMOJI_CACHE_EXPIRY_DAYS`
3. Verify server ID isn't changing (shouldn't happen)

## Performance Considerations

### Message Latency

- **First time**: 1-3 seconds (download + upload + processing)
- **Cached**: <100ms (instant lookup)

### Rate Limiting

- Discord CDN: No rate limiting on emoji downloads
- Revolt API: Standard rate limits apply to emoji uploads
- The bot handles rate limiting automatically

### Memory Usage

- Cache is stored in memory
- Typical usage: ~50-100 KB per 1000 cached emojis
- Cache clears expired entries automatically

## Examples

### Example 1: Simple Emoji

```
Discord: "Thanks <:thumbsup:789012345>"
Revolt:  "Thanks 👍" (displays as custom emoji)
```

### Example 2: Multiple Emojis

```
Discord: "Party time! <:party1:111> <:party2:222> <:party3:333>"
Revolt:  "Party time! 🎉 🎊 🎈" (all as custom emojis)
```

### Example 3: Animated Emoji

```
Discord: "Loading <a:loading:444444444>"
Revolt:  "Loading ⏳" (animated custom emoji)
```

## Disabling Emoji Sync

If you prefer the old behavior (image links), disable emoji syncing:

```env
SYNC_EMOJIS_TO_REVOLT=false
```

Messages will then show emojis as clickable image links:
```
"Hello [:wave:](https://cdn.discordapp.com/emojis/123456789.webp) from Discord!"
```

## API Reference

### EmojiSyncManager

The core emoji syncing functionality is handled by `EmojiSyncManager` class:

```typescript
// Sync an emoji from Discord to Revolt
async syncEmoji(
  discordEmojiId: string,
  emojiName: string,
  isAnimated: boolean,
  revoltChannelId: string
): Promise<string | null>
```

**Parameters:**
- `discordEmojiId`: Discord emoji ID (e.g., "123456789")
- `emojiName`: Emoji name (e.g., "wave")
- `isAnimated`: Whether the emoji is animated
- `revoltChannelId`: Revolt channel ID (used to get server ID)

**Returns:**
- Revolt emoji ID if successful
- `null` if sync failed

### Cache Management

```typescript
// Clear expired cache entries
clearExpiredCache(): void

// Get cache statistics
getCacheStats(): { size: number; entries: EmojiCacheEntry[] }
```

## Contributing

Found a bug or have a feature request? Please open an issue on GitHub!

### Future Improvements

Potential future enhancements:
- [ ] Batch emoji uploads for better performance
- [ ] Persistent cache (database storage)
- [ ] Emoji usage statistics
- [ ] Automatic cleanup of unused emojis
- [ ] Emoji name conflict resolution
- [ ] Bidirectional syncing (Revolt → Discord)

## License

This feature is part of revcord and is licensed under the same terms (MIT License).
