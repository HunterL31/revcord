# Environment Setup for Image Uploads

## Required Environment Variables

Add these variables to your `.env` file:

```bash
# Existing variables (keep these)
DISCORD_TOKEN=your_discord_bot_token
REVOLT_TOKEN=your_revolt_bot_token
API_URL=https://stoat.king-theropod.ts.net/api
REVOLT_ATTACHMENT_URL=https://stoat.king-theropod.ts.net/autumn

# NEW: Image Upload Configuration
UPLOAD_IMAGES_TO_REVOLT=true
MAX_IMAGE_SIZE_MB=10
IMAGE_UPLOAD_TIMEOUT_MS=30000
FALLBACK_TO_URL_ON_ERROR=true
SUPPORTED_IMAGE_FORMATS=jpeg,jpg,png,gif,webp
```

## Configuration Options

- `UPLOAD_IMAGES_TO_REVOLT`: Enable/disable image uploading (default: false)
- `MAX_IMAGE_SIZE_MB`: Maximum image size in MB (default: 10)
- `IMAGE_UPLOAD_TIMEOUT_MS`: Upload timeout in milliseconds (default: 30000)
- `FALLBACK_TO_URL_ON_ERROR`: Show URLs if upload fails (default: true)
- `SUPPORTED_IMAGE_FORMATS`: Comma-separated list of formats (default: jpeg,jpg,png,gif,webp)

## Quick Start

1. Add the environment variables above to your `.env` file
2. Restart the revcord bot
3. Send an image in Discord - it should now appear natively in Revolt! 🎉

## Testing

To test the image upload feature:
1. Set `UPLOAD_IMAGES_TO_REVOLT=true` in your `.env`
2. Restart the bot: `npm start`
3. Send an image in a bridged Discord channel
4. Check the corresponding Revolt channel - the image should display inline!

## Troubleshooting

If images aren't uploading:
- Check the bot logs for upload errors
- Verify `REVOLT_TOKEN` has proper permissions
- Ensure `REVOLT_ATTACHMENT_URL` is correct
- Try reducing `MAX_IMAGE_SIZE_MB` if uploads fail
- Check your Discord-Revolt channel mappings are working

## Logs to Watch

The bot will log image upload progress:
- `🖼️ Uploading image: filename.png (2.1MB)`
- `✅ Image uploaded: filename.png -> file_id`
- `❌ Image upload failed: filename.png - error message`
