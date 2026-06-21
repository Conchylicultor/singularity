/** Inferred kind of a hook whose state changed (drove a re-render). */
export type HookKind =
  | "state"
  | "reducer"
  | "external-store"
  | "effect"
  | "layout-effect"
  | "memo"
  | "callback"
  | "ref"
  | "context"
  | "unknown";

/**
 * One hook in a component's hook-call order.
 * `index` is the position in the component's hook list (for context entries it
 * is the context-dependency position, kind "context"). `changed` is true when
 * the hook's memoized value differed from the previous commit.
 */
export interface HookChange {
  index: number;
  kind: HookKind;
  changed: boolean;
}

/** Aggregated stats for one initiator signature over a profiling session. */
export interface InitiatorStat {
  signature: string;
  componentName: string;
  /** Nearest few ancestor component display names, nearest-last. */
  ancestorPath: string[];
  /**
   * Number of distinct commits this initiator appeared in (≤ total commits).
   * This — not the raw fiber count — is the "ticks every ~1s" rate driver.
   */
  commitCount: number;
  /**
   * Number of fiber instances sharing this signature in the most recent commit
   * it appeared in. >1 means a repeated list row (e.g. 180 SortableItem rows all
   * re-rendering together); the row re-renders `commitCount`×, ×`instanceCount`
   * fibers each.
   */
  instanceCount: number;
  ratePerSec: number;
  firstSeenMs: number;
  lastSeenMs: number;
  changedHooks: HookChange[];
}

/** The ranked snapshot the pane and headless callers read. */
export interface ProfilerReport {
  running: boolean;
  startedAtMs: number | null;
  durationMs: number;
  totalCommits: number;
  commitsPerSec: number;
  initiators: InitiatorStat[];
  /**
   * Set when the passive commit bridge (index.html) was not installed — e.g.
   * the frontend was not rebuilt after this feature landed. The engine cannot
   * receive commit callbacks; the pane surfaces this so the user runs a build.
   */
  bridgeMissing?: boolean;
}

export interface ProfilerStartOptions {
  /** Auto-stop after this many ms. Default 30000. */
  maxDurationMs?: number;
}
