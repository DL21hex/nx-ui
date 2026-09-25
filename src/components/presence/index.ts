import { define } from "../../core/define";
import { NxPresence } from "./presence";

define("nx-presence", NxPresence);

export { NxPresence, PRESENCE_LABELS } from "./presence";
export { HEARTBEAT_MS as PRESENCE_HEARTBEAT_MS, TIMEOUT_MS as PRESENCE_TIMEOUT_MS, applyEvent as applyPresenceEvent, cleanEvent as cleanPresenceEvent, hueOf as presenceHue, summarize as summarizePresence } from "./logic";
export type { PresenceActivity, PresenceNote, PresencePeer } from "./logic";
export type { PresenceEvent, PresenceEventType, PresenceLabels, PresenceState, PresenceUser } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-presence": NxPresence;
  }
  interface HTMLElementEventMap {
    "nx-presence-change": CustomEvent<{ users: import("./types").PresenceState[] }>;
    "nx-presence-local": CustomEvent<import("./types").PresenceEvent>;
  }
}
