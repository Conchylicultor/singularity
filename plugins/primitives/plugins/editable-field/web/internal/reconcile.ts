/**
 * What to do when the field's external `value` and the local draft disagree.
 *
 * - `echo` — the external value IS the last thing we saved (or the seed). This
 *   is our own write coming back; there is nothing new.
 * - `adopt` — the external value moved on and the draft carries no unsaved
 *   edits, so taking it loses nothing. This is the common case, and the one the
 *   hook used to DROP whenever the field happened to have focus.
 * - `converged` — the draft already spells the external value (the user typed
 *   their way to it, or a save is racing an identical write). Nothing to
 *   replace; just record that the two sides agree.
 * - `conflict` — the external value moved on AND the draft carries unsaved
 *   edits. Neither side can be discarded silently: the draft stays on screen
 *   and the divergence is reported.
 */
export type Reconciliation = "echo" | "adopt" | "converged" | "conflict";

/**
 * The reconcile policy, as a pure function of the three strings that decide it:
 * what the server says now (`external`), what is on screen (`draft`), and what
 * this field last put on the server (`lastSaved`). Divergence is exactly
 * `draft !== lastSaved` — the user has typed something no save has taken yet.
 */
export function reconcile<T extends string>(
  external: T,
  draft: T,
  lastSaved: T,
): Reconciliation {
  if (Object.is(external, lastSaved)) return "echo";
  if (Object.is(draft, lastSaved)) return "adopt";
  if (Object.is(draft, external)) return "converged";
  return "conflict";
}
