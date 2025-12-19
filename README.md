<p align="center">
  <img src="docs/revcord.png" width="64px" />
</p>

<h1 align="center">revcord</h1>
<p align="center">
  <img src="https://img.shields.io/github/v/release/mayudev/revcord?style=for-the-badge">
  <img src="https://img.shields.io/github/license/mayudev/revcord?style=for-the-badge">
  <img src="https://img.shields.io/github/languages/top/mayudev/revcord?style=for-the-badge">
</p>

<p align="center"><b>🌉 A cord to connect your Revolt and Discord servers</b></p>

🔗 A bridge for Discord and [Revolt](https://revolt.chat) with easy setup through commands, written in TypeScript using [revolt.js](https://github.com/revoltchat/revolt.js).

[Features](#features) | [Setup](#setup) | [Configuration](#configuration) | [Emoji Syncing](#emoji-syncing) | [Troubleshooting](#troubleshooting)

## 📔 Features <a id="features"></a>

- [x] Bridge messages between platforms
- [x] Bridge attachments
- [x] Bridge replies
- [x] Bridge message edit and delete
- [x] Bridge embeds
- [x] Bridge emoji[^1]
- [x] Seamlessly display user information
- [x] Clone entire Discord servers to Revolt
- [x] Copy message history between platforms
- [x] Sync Discord custom emojis to Revolt servers[^2]

[^1]: Revolt to Discord works, but limited to 3 emojis displayed to stop bombing with links. Animated emojis from Revolt will convert to static due to limits on Revolt's image backend
[^2]: Discord custom emojis are automatically downloaded and uploaded to the Revolt server as custom emojis with the same name, then used in messages

![Screenshot - Revolt](docs/discord.png) ![Screenshot - Discord](docs/revolt.png)

## 🔩 Setup <a id="setup"></a>

You can use [Docker](#using-docker) as well.

**Node v16.9+ is required!**

Important: this bot is meant to be used in one server (Discord+Revolt), but can be used in more as long as they share the same admin.

1. Clone this repository, install dependencies and build

```sh
git clone https://github.com/mayudev/revcord
cd revcord
npm install
npm run build
```

2. Create a bot in Discord ([Guide](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot)) and Revolt (Open user settings -> `My Bots` -> `Create a bot`)
3. Place the relevant tokens in environment variables. The easiest way is to create a `.env` file (yes, a file called `.env`):

```
DISCORD_TOKEN = ...
REVOLT_TOKEN = ...
```

Of course, replace ... with tokens.

If you are running a self-hosted instance of Revolt, additionally set the `API_URL` and `REVOLT_ATTACHMENT_URL` variable:

```
API_URL = https://api.revolt.chat
REVOLT_ATTACHMENT_URL = https://autumn.revolt.chat
```

### Optional Configuration

You can customize the behavior of the bot with these optional environment variables:

**Image Upload:**
```
UPLOAD_IMAGES_TO_REVOLT = true              # Enable/disable image upload to Revolt (default: false)
MAX_IMAGE_SIZE_MB = 10                      # Maximum image size in MB (default: 10)
SUPPORTED_IMAGE_FORMATS = jpeg,jpg,png,gif,webp  # Supported formats (default: jpeg,jpg,png,gif,webp)
IMAGE_UPLOAD_TIMEOUT_MS = 30000             # Upload timeout in ms (default: 30000)
FALLBACK_TO_URL_ON_ERROR = true             # Fallback to URL if upload fails (default: true)
```

**Emoji Sync:**
```
SYNC_EMOJIS_TO_REVOLT = true                # Enable/disable emoji syncing (default: true)
MAX_EMOJI_SIZE_MB = 5                       # Maximum emoji size in MB (default: 5)
EMOJI_CACHE_EXPIRY_DAYS = 7                 # Days to cache synced emojis (default: 7)
EMOJI_FALLBACK_TO_LINK = true               # Fallback to link if sync fails (default: true)
```

4. **Important!** Make sure to select the following permissions in URL Generator when making an invite for your bot (Your bot in Discord Developers -> `OAuth2` -> `URL Generator`) (or if you're lazy, just select `Administrator`) Note **applications.commands**!

![permissions](docs/permissions.png)

5. Enable the `Message Content Intent` under Bot -> Privileged Gateway Intents. If you forget to do this, the bot will crash with a `Used disallowed intents` message.

![intent](docs/intent.png)

6. **Important!** On Revolt, make sure to add the bot to a role that has the **Masquerade** permission!

![revolt permissions](docs/mask.png)

7. Invite the bot to to a Revolt and Discord server.
8. Start the bot using `npm start`.

Note: it's recommended to use something like [pm2](https://pm2.keymetrics.io/) or [nodemon](https://nodemon.io/) to run the bot. Make sure to pass the `--experimental-specifier-resolution=node` flag to node manually, otherwise it will not run (it's included in the default start script).

### Using Docker

You need Docker and docker-compose installed.

Follow the steps above to create a `.env` file[^2]. You do not have to run `npm install` and `npm run build`, obviously. Also, make sure your bots have all the required permissions as explained above.

Before you run docker-compose, use `touch revcord.sqlite` to create the database file and leave it empty.

Then you should be ready to go.

```
docker-compose up -d
```

[^2]: Alternatively, you can edit the `docker-compose.yml` file appropriately. Make sure to remove `./.env:/app/.env` below `volumes:` so it won't complain when you don't have a `.env` file.

## 🔧 Configuration <a id="configuration"></a>

### with commands

You can use either slash commands on Discord or `rc!` prefix on Revolt (use `rc!help` to show all commands)

To use the commands, **you** need the `Administrator` permission on Discord. On Revolt, only the server owner can run them (for now).

### Connecting Discord and Revolt channels

From **Discord**:

```
/connect <Revolt channel name or ID>
```

From **Revolt**:

```
rc!connect <Discord channel name or ID>
```

For example:

```
# From Discord
/connect lounge
/connect 01AB23BC34CD56DE78ZX90WWDB

# From Revolt
rc!connect general
rc!connect 591234567890123456
```

✔️ Send a message to see if it works. Try editing and deleting it.

### Removing the connection

From **Discord**:

```
/disconnect
```

From **Revolt**:

```
rc!disconnect
```

You don't have to specify any channel. It will disconnect the channel the command is sent in.

### Showing connections

From **Discord**:

```
/connections
```

From **Revolt**:

```
rc!connections
```

### Toggling bots

You can toggle whether messages sent by bots should be forwarded. It's enabled by default (it's requied for NQN to work properly).

Use either `rc!bots` or `/bots`

### Cloning an entire Discord server

You can clone an entire Discord server structure to Revolt, including all channels and optionally message history!

From **Discord**:

```
/clone <Revolt server ID> [copy_history: true/false] [max_messages: 100] [preview: true/false]
```

From **Revolt**:

```
rc!clone <Discord server ID> [--history] [--max=100] [--preview]
```

**Important notes:**
- You need Administrator permissions on Discord or be the server owner on Revolt
- The bot must be a member of both servers
- Use `preview: true` or `--preview` to see what would be cloned without actually doing it
- Copying message history can take a very long time (use `max_messages` to limit)
- Channels will be automatically bridged after cloning
- Rate limiting is applied to avoid overwhelming the APIs

**Examples:**

```
# Preview what would be cloned (from Discord)
/clone revolt_server_id preview:true

# Clone channels without history (from Discord)
/clone 01AB23BC34CD56DE78ZX90WWDB copy_history:false

# Clone with last 50 messages per channel (from Revolt)
rc!clone 123456789012345678 --history --max=50

# Just preview (from Revolt)
rc!clone 123456789012345678 --preview
```

### with mappings.json (not recommended)

#### This is not recommended!

1. Create a `mappings.json` file in the root directory.
2. Use the following format:

```json
[
  {
    "discord": "discord_channel_id",
    "revolt": "revolt_channel_id"
  },
  {
    "discord": "another_discord_channel_id",
    "revolt": "another_revolt_channel_id"
  }
]
```

## 😀 Emoji Syncing <a id="emoji-syncing"></a>

Discord custom emojis are automatically synced to Revolt! When a message contains Discord custom emojis like `<:emojiname:164859>`, the bot will:

1. Download the emoji image from Discord
2. Upload it to the Revolt server as a custom emoji
3. Use the Revolt emoji in the bridged message

This feature is **enabled by default** and requires no additional setup. The bot automatically caches synced emojis to avoid re-uploading.

**Configuration options:**
```env
SYNC_EMOJIS_TO_REVOLT=true           # Enable/disable (default: true)
MAX_EMOJI_SIZE_MB=5                  # Max emoji size (default: 5MB)
EMOJI_CACHE_EXPIRY_DAYS=7            # Cache duration (default: 7 days)
EMOJI_FALLBACK_TO_LINK=true          # Fallback behavior (default: true)
```

📖 For detailed information, see [EMOJI_SYNC_GUIDE.md](EMOJI_SYNC_GUIDE.md)

**Important:** The bot needs **Manage Server** permission on Revolt to upload custom emojis.

## 🔥 Troubleshooting <a id="troubleshooting"></a>

### `npm install` takes way too long, or `Please install sqlite3 package manually` (Raspberry Pi / 32-bit arm devices)

This is an issue with `node-sqlite3` being a native module, but has no prebuilt binaries for 32-bit arm architectures available, therefore falling back to building from source.

However, a Raspberry Pi is usually too low powered to finish compiling it.

So, the only solution would be to use a more powerful device to cross-compile it to arm. For convenience, a prebuilt binary for `armv7l` architecture was provided [here](https://github.com/mayudev/revcord/releases/download/v1.2/node_sqlite3.node)

You have to place it in `node_modules/sqlite3/lib/binding/napi-v6-linux-glibc-arm/node_sqlite3.node`.

Alternatively, if your device supports it (Raspberry Pi 3 does), you can install a 64-bit distribution.

### Messages sent to Discord have no content!

As in [setup](#setup) step 5, you need to enable the `Message Content Intent` in Discord bot settings. If this doesn't work, make sure the bot has permissions to read the messages in a channel.

![intent](docs/intent.png)

### Bot doesn't have sufficient permissions in the channel. Please check if the Manage Webhooks permission isn't being overridden for the bot role in that specific channel.

Aside from server-wide permissions, there are also channel-specific permissions. This message means that at some point, the bot's permission to manage webhooks is being overridden on the channel level. The easiest fix is to change the override to allow it. Alternatively, you can grant the bot the `Administrator` permission which overrides all channel-specific permissions.

In channel settings -> Permissions:

![override](docs/override.png)
