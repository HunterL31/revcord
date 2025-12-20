import { DiscordCommand } from "app/interfaces";
import { AllowBotsCommand } from "./allowBots";
import { CleanupCommand } from "./cleanup";
import { CloneCommand } from "./clone";
import { CloneChannelCommand } from "./cloneChannel";
import { ConnectCommand } from "./connect";
import { DisconnectCommand } from "./disconnect";
import { ListConnectionsCommand } from "./listConnections";

/**
 * An array of Discord slash commands
 */
export const slashCommands: DiscordCommand[] = [
  new ConnectCommand(),
  new DisconnectCommand(),
  new ListConnectionsCommand(),
  new AllowBotsCommand(),
  new CloneCommand(),
  new CloneChannelCommand(),
  new CleanupCommand(),
];
