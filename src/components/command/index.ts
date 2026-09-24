import { define } from "../../core/define";
import { NxCommand } from "./command";

define("nx-command", NxCommand);

export { NxCommand, COMMAND_LABELS } from "./command";
export { flattenMenu, searchCommands, scoreItem, recentItems, recordUse, frecency, matchesHotkey } from "./logic";
export type { CommandItem, CommandLabels, CommandSelectDetail, CommandUsage, CommandUse } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-command": NxCommand;
  }
  interface HTMLElementEventMap {
    "nx-command-select": CustomEvent<import("./types").CommandSelectDetail>;
    "nx-command-ask": CustomEvent<{ query: string }>;
  }
}
