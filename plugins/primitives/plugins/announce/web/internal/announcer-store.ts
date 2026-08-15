/**
 * The one channel a state change with no native carrier speaks through.
 *
 * Shaped exactly like the toast ledger next door (`shell/toast`): a module-level
 * external store plus a plain imperative writer callable from anywhere, and a
 * single host mounted at `Core.Root` that renders whatever the store holds. If
 * no host is mounted the write simply has no renderer — a silent no-op, never a
 * throw, so a caller never has to know whether the app shell is up.
 *
 * Process-global on purpose, the same way the toast stack is: a live region is
 * a property of the *page*, not of a surface. A screen reader has one speech
 * queue for the document, so two per-surface announcers would not isolate
 * anything — they would just both talk. One host, one queue.
 *
 * NO TIMERS anywhere in here (the repo's no-polling rule, and also the right
 * design): the usual "clear the region after N ms so the next identical message
 * re-fires" trick is a timer whose only job is to defeat the DOM's own
 * change detection. We defeat it directly instead — see `nextText` below.
 */

/**
 * What the two live regions currently hold. One object, frozen, replaced whole
 * on every write: `useSyncExternalStore` compares snapshots by identity, so the
 * snapshot must be a stable reference between writes (returning a fresh object
 * from `getSnapshot` is the classic infinite-render loop) and a *different*
 * reference on each write.
 */
export type Announcement = {
  /** Spoken when the user's screen reader next reaches a pause. */
  readonly polite: string;
  /** Spoken by interrupting whatever is being read. Reserve for real urgency. */
  readonly assertive: string;
};

const EMPTY: Announcement = Object.freeze({ polite: "", assertive: "" });

let snapshot: Announcement = EMPTY;
const listeners = new Set<() => void>();

/** Subscribe to announcement writes. Returns the unsubscribe. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current live-region contents. Stable identity between writes. */
export function getSnapshot(): Announcement {
  return snapshot;
}

/**
 * The re-announce rule, and the whole reason this store is not a plain `=`.
 *
 * A live region is announced when its *text changes*. Selecting the same block
 * twice, or clearing an already-clear selection, produces the identical string —
 * and an identical string is no change, so assistive tech stays silent exactly
 * when the user asked for confirmation.
 *
 * So a write of the text that is already there lands as that text plus one
 * trailing space, and the write after that drops the space again. The rendered
 * string differs every time, the *spoken* string never does (trailing
 * whitespace is not read aloud), and no timer is involved.
 */
function nextText(current: string, message: string): string {
  return current === message ? `${message} ` : message;
}

/**
 * Speak a state change that no control announces on its own.
 *
 * Read `CLAUDE.md` before adding a call: an announcement duplicating something
 * a control already exposes (a checkbox's checked state, a button's
 * `aria-pressed`) is heard twice, which is worse than not announcing at all.
 *
 * @param message What to say, as a sentence — it is read verbatim.
 * @param opts.assertive Interrupt the current speech instead of queueing behind
 * it. Errors and destructive outcomes only; everything else is polite.
 */
export function announce(
  message: string,
  opts?: { assertive?: boolean },
): void {
  // Nothing to say is not an announcement. Writing "" would also be the one
  // write the toggle above cannot make audible, so it is refused here rather
  // than silently landing as a space.
  if (message.trim() === "") return;

  snapshot = Object.freeze(
    opts?.assertive
      ? {
          polite: snapshot.polite,
          assertive: nextText(snapshot.assertive, message),
        }
      : {
          polite: nextText(snapshot.polite, message),
          assertive: snapshot.assertive,
        },
  );
  for (const listener of listeners) listener();
}
