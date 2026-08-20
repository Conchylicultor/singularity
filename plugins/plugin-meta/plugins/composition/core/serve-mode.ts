// The serve modes — what a composition's `serve` field may say — and the ONE
// thing a mode means: how often an automatic rebuild of it is allowed.
//
// A mode carries no other behaviour. Every edge that could rebuild a
// composition asks `autoRebuildIntervalMs` and nothing else, so `push` needs no
// push-specific plumbing and a cadence needs no cadence-specific edge — the
// only difference between them is a number.

/**
 * The closed set, in the order a picker should offer it: not served, then the
 * hand-driven mode, then the automatic ones from most to least eager.
 */
export const SERVE_MODES = [
  "off",
  "manual",
  "push",
  "hourly",
  "daily",
  "weekly",
] as const;

export type ServeMode = (typeof SERVE_MODES)[number];

/**
 * The label each mode is offered under. A total `Record` for the same reason
 * the interval record below is: several surfaces render this vocabulary (the
 * config field's enum options, the Studio list's cell, the serve panel's
 * picker), and a mode that reaches any of them without a label is a mode nobody
 * can name.
 *
 * Private: consumers read {@link SERVE_MODE_OPTIONS} for a picker and
 * {@link serveModeLabel} for one mode, so there is no unchecked index into it.
 */
const SERVE_MODE_LABELS: Record<ServeMode, string> = {
  off: "Not served",
  manual: "Manual only",
  push: "On every push",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
};

export interface ServeModeOption {
  readonly value: ServeMode;
  readonly label: string;
}

/**
 * The `{ value, label }` option list, in `SERVE_MODES` order — the single
 * source both the config field's enum and any mode picker read, so the set and
 * its labels cannot drift apart between them.
 */
export const SERVE_MODE_OPTIONS: readonly ServeModeOption[] = SERVE_MODES.map(
  (value) => ({ value, label: SERVE_MODE_LABELS[value] }),
);

/**
 * How long after a composition's last build an automatic rebuild of it may run.
 * A total `Record` over the mode union on purpose: adding a mode to
 * {@link SERVE_MODES} is then a tsc error here rather than a mode that silently
 * never rebuilds — the rule `CADENCE_INTERVAL_MS` states for refresh cadences.
 *
 * `null` is "never rebuilt automatically", not "zero delay", and `push`'s `0` is
 * the other end of that same distinction — rebuild at the first edge that
 * notices the commit moved. Collapsing either into the other is exactly the bug
 * this record exists to make unspellable.
 */
const AUTO_REBUILD_INTERVAL_MS: Record<ServeMode, number | null> = {
  off: null,
  manual: null,
  push: 0,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function isServeMode(mode: string): mode is ServeMode {
  return (SERVE_MODES as readonly string[]).includes(mode);
}

/**
 * Narrow a stored mode to the union, or throw.
 *
 * The public functions take a `string` because that is what the stored field is:
 * `enumField` types its value as `string` rather than the literal union, and the
 * union is enforced by the config's zod enum on read. So an unknown value cannot
 * occur; if one ever does it is a broken invariant, not an input. Throwing says
 * that, where defaulting to a mode would quietly rebuild (or quietly stop
 * rebuilding) something nobody asked for.
 */
function assertServeMode(mode: string): ServeMode {
  if (!isServeMode(mode)) {
    throw new Error(
      `Unknown serve mode "${mode}" — expected one of ${SERVE_MODES.join(", ")}.`,
    );
  }
  return mode;
}

/**
 * The minimum age of a composition's last build before an automatic rebuild may
 * run — `null` when this mode is never rebuilt automatically (`off`, `manual`).
 */
export function autoRebuildIntervalMs(mode: string): number | null {
  return AUTO_REBUILD_INTERVAL_MS[assertServeMode(mode)];
}

/** The label one stored mode is offered under. */
export function serveModeLabel(mode: string): string {
  return SERVE_MODE_LABELS[assertServeMode(mode)];
}

/**
 * Whether this mode declares the composition meant to be live here. Every mode
 * but `off` is a serve intent; they differ only in when an automatic rebuild may
 * run.
 *
 * Intent, never liveness — the `composition.json` marker is the only answer to
 * "is something actually there".
 */
export function isServed(mode: string): boolean {
  return mode !== "off";
}
