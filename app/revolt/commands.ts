import { RevoltCommand } from "../interfaces";
import { AllowBotsCommand } from "./allowBots";
import { CleanupCommand } from "./cleanup";
import { CloneCommand } from "./clone";
import { CloneChannelCommand } from "./cloneChannel";
import { ConnectCommand } from "./connect";
import { DisconnectCommand } from "./disconnect";
import { HelpCommand } from "./help";
import { ListConnectionsCommand } from "./listConnections";
import { PingCommand } from "./ping";

/**
 * An array of Revolt commands
 */
export const revoltCommands: RevoltCommand[] = [
  new ConnectCommand(),
  new DisconnectCommand(),
  new ListConnectionsCommand(),
  new HelpCommand(),
  new AllowBotsCommand(),
  new PingCommand(),
  new CloneCommand(),
  new CloneChannelCommand(),
  new CleanupCommand(),
];
