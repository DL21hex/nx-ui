import { define } from "../../core/define";
import { NxSync } from "./sync";

define("nx-sync", NxSync);

export { NxSync, SYNC_LABELS } from "./sync";
export { nxSync, createSync, memoryStore as syncMemoryStore, idbStore as syncIdbStore, backoff as syncBackoff, retryAfter as syncRetryAfter, classify as classifySyncResponse, diffFields as syncDiffFields, resolveBody as syncResolveBody } from "./logic";
export type { SyncQueue, SyncDiff, SyncVerdict } from "./logic";
export type { SyncChangeDetail, SyncConflict, SyncEvent, SyncField, SyncInput, SyncJson, SyncLabels, SyncListener, SyncMethod, SyncOp, SyncOptions, SyncState, SyncStatus, SyncStore } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-sync": NxSync;
  }
  interface HTMLElementEventMap {
    "nx-sync-change": CustomEvent<import("./types").SyncChangeDetail>;
    "nx-sync-done": CustomEvent<{ op: import("./types").SyncOp; data: unknown }>;
  }
}
