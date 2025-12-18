# Server Cloning Guide

## Overview

The bot now supports cloning entire Discord servers to Revolt! This powerful feature allows you to:

- 🔍 **Scan** all text channels in a Discord server
- 📋 **Clone** the channel structure to a Revolt server
- 📜 **Copy** message history from Discord to Revolt
- 🖼️ **Upload** Discord images natively to Revolt (no more broken links!)
- 🔗 **Bridge** channels automatically for real-time syncing

## Requirements

- Administrator permissions on Discord (or server owner on Revolt)
- The bot must be a member of both servers
- The Revolt server must already exist
- Proper permissions for the bot on both platforms (see main README)
- **For image uploads**: Set `UPLOAD_IMAGES_TO_REVOLT=true` in your `.env` file

## Commands

### Discord Command

```
/clone <revolt_server_id> [copy_history: true/false] [max_messages: 100] [preview: true/false]
```

**Parameters:**
- `revolt_server_id` (required): The ID of the target Revolt server
- `copy_history` (optional): Whether to copy message history (default: false)
- `max_messages` (optional): Maximum messages to copy per channel (default: 100)
- `preview` (optional): Preview what would be cloned without actually cloning (default: false)

### Revolt Command

```
rc!clone <discord_server_id> [--history] [--max=100] [--preview]
```

**Parameters:**
- `discord_server_id` (required): The ID of the source Discord server
- `--history` (optional): Copy message history
- `--max=N` (optional): Maximum messages to copy per channel (default: 100)
- `--preview` (optional): Preview what would be cloned without actually cloning

## Image Upload Configuration

To enable native image uploads during cloning (recommended):

```bash
# Add to your .env file
UPLOAD_IMAGES_TO_REVOLT=true
MAX_IMAGE_SIZE_MB=10
IMAGE_UPLOAD_TIMEOUT_MS=30000
FALLBACK_TO_URL_ON_ERROR=true
SUPPORTED_IMAGE_FORMATS=jpeg,jpg,png,gif,webp
```

**Benefits of enabling image uploads:**
- Images appear natively in Revolt (better user experience)
- Images won't break if Discord links expire
- No authentication issues for viewing images

**What happens without image uploads:**
- All attachments appear as clickable URLs
- Users must click links to view images
- Links may expire over time

## How It Works

### 1. Channel Scanning

The bot scans all text channels in the Discord server, organizing them by category. Channels without a category are grouped under "Uncategorized".

### 2. Channel Creation

For each Discord channel found:
- Checks if a channel with the same name already exists on Revolt
- If not, creates a new channel with the same name and description
- Preserves channel topics as descriptions

### 3. Message History Copying (Optional)

If `copy_history` is enabled:
- Downloads messages from Discord channels in chronological order
- **Images are uploaded natively** to Revolt (if `UPLOAD_IMAGES_TO_REVOLT=true`)
- Non-image attachments fallback to URL links
- Rate-limited to avoid overwhelming the APIs

### 4. Channel Bridging

After creating channels:
- Automatically creates a mapping between Discord and Revolt channels
- Sets up webhooks for Discord channels
- Enables real-time message bridging (bi-directional)

### 5. History Copying (Optional)

If enabled:
- Fetches the specified number of messages from each Discord channel
- Copies them to the corresponding Revolt channel in chronological order
- Preserves author information using masquerade
- **Uploads images natively** to Revolt (if image uploads enabled)
- Non-image attachments included as URLs
- Skips bot messages for cleaner history

## Examples

### Preview Mode

See what would be cloned without making any changes:

**From Discord:**
```
/clone 01AB23BC34CD56DE preview:true
```

**From Revolt:**
```
rc!clone 123456789012345678 --preview
```

### Clone Without History

Clone just the channel structure (fastest):

**From Discord:**
```
/clone 01AB23BC34CD56DE copy_history:false
```

**From Revolt:**
```
rc!clone 123456789012345678
```

### Clone With History

Clone channels and copy the last 50 messages from each:

**From Discord:**
```
/clone 01AB23BC34CD56DE copy_history:true max_messages:50
```

**From Revolt:**
```
rc!clone 123456789012345678 --history --max=50
```

### Full Clone

Clone everything with maximum history (Warning: Very slow!):

**From Discord:**
```
/clone 01AB23BC34CD56DE copy_history:true max_messages:1000
```

**From Revolt:**
```
rc!clone 123456789012345678 --history --max=1000
```

## Important Notes

### Performance

- **Without history:** Cloning typically takes 1-2 minutes for a medium-sized server
- **With history:** Can take 30+ minutes depending on message count and channel count
- The bot applies rate limiting to avoid overwhelming the APIs
- Progress updates are shown every 5 channels

### Rate Limiting

The bot includes built-in rate limiting:
- 1 second delay between channel creations
- 0.5 seconds delay between Discord message batch fetches
- 1 second delay between Revolt message sends

### Limitations

- Only text channels are cloned (voice channels are skipped)
- Channel categories are not directly recreated on Revolt (but channel names are preserved)
- Embeds from regular users are not copied (Discord doesn't allow regular users to send embeds)
- Message reactions are not copied
- Bot messages are skipped during history copying for cleaner results
- Maximum Discord message fetch is limited by Discord's API (typically 100 per request)

### Best Practices

1. **Start with preview mode** to see what will be cloned
2. **Test with a small server** first to understand the timing
3. **Use lower max_messages values** initially (50-100) to avoid long waits
4. **Ensure the bot has proper permissions** before starting
5. **Don't interrupt the process** once started - let it complete
6. **Monitor the bot logs** for any errors during cloning

## Troubleshooting

### "Revolt server not found"
- Make sure the Revolt server ID is correct
- Ensure the bot is a member of the Revolt server

### "Discord server not found"
- Make sure the Discord server ID is correct
- Ensure the bot is a member of the Discord server

### "Permission denied"
- Verify you have Administrator permissions on Discord
- Verify you are the server owner on Revolt

### Cloning stops partway through
- Check the bot logs for specific errors
- Common issues: rate limiting, insufficient permissions, or channel name conflicts
- The bot will continue creating other channels even if one fails

### Messages aren't copying
- Ensure the bot has "View Message History" permission on Discord
- Ensure the bot has "Masquerade" permission on Revolt
- Check that `copy_history` is set to `true` or `--history` flag is used

## Advanced Usage

### Getting Server IDs

**Discord:**
1. Enable Developer Mode in Discord settings
2. Right-click on the server icon
3. Click "Copy ID"

**Revolt:**
1. Open the server
2. Look at the URL: `https://app.revolt.chat/server/SERVER_ID_HERE`

### Handling Large Servers

For servers with many channels or messages:
1. Use preview mode first
2. Consider cloning in phases:
   - First clone without history
   - Test the bridging works
   - Manually copy history for important channels only
3. Increase the `maxMessagesPerChannel` gradually if needed

### Cleaning Up

If you need to disconnect channels after cloning:
- Use `/disconnect` in each Discord channel
- Or use `rc!disconnect` in each Revolt channel
- This removes the bridge but keeps the cloned channels

## Support

If you encounter issues:
1. Check the bot console logs for detailed error messages
2. Verify all permissions are correctly set
3. Ensure both bots are online and connected
4. Try the preview mode to diagnose issues
5. File an issue on GitHub with error details

## Future Enhancements

Potential improvements being considered:
- Voice channel cloning
- Category recreation on Revolt
- Selective channel cloning (choose specific channels)
- Resume support if cloning is interrupted
- Progress persistence across bot restarts
