/**
 * The mints for the three id namespaces this plugin's tables are keyed by —
 * `tasks.id`, `attempts.id` and `conversations.id`.
 *
 * ## Why they live here and not at their call sites
 *
 * Each of these ids is also PARSED, in a place far from where it is minted: a
 * bare `task-…` / `att-…` / `conv-…` written in assistant prose is recognised by
 * an active-data chip's pattern and rendered as a clickable widget. A pattern
 * that parses a shape is a second, independent declaration of that shape — and
 * when the two drift, nothing fails: the mint keeps working and the chips
 * silently stop matching. That has already happened once in this repo (the
 * retired `block-\d+-[a-z0-9]{4,8}` shape; see
 * `plugins/active-data/plugins/page-link/web/internal/pattern.ts`).
 *
 * Exporting the mints is what lets each chip's `pattern.test.ts` build its
 * fixtures from the REAL mint instead of hand-typing an id that looks right.
 * The pattern is still a second declaration — but a change to either half now
 * fails a test instead of quietly switching the chips off.
 *
 * ## The two shapes are deliberately different, and both are preserved verbatim
 *
 * A task id stamps epoch MILLISECONDS and slices a 6-char suffix; an attempt or
 * conversation id stamps epoch SECONDS and slices a 4-char one. That asymmetry
 * predates this file and is load-bearing only in the sense that live rows carry
 * both shapes — moving the expressions here changed neither.
 *
 * KNOWN WART, deliberately not fixed here: `Math.random().toString(36)` yields
 * a SHORTER string than the slice asks for when the double has few significant
 * base-36 digits (`0.5` → `"i"`), so a mint can rarely emit a 1-3 char suffix
 * that its own chip pattern (which requires at least four) will not match.
 * `newPrototypeId` (`apps/prototypes/…/files/core/id.ts`) shows the fix —
 * `Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0")` — but
 * applying it here changes the bytes of every id the app mints, which is not a
 * hardening change.
 */

/** A new `tasks.id`: `task-<epochMillis>-<up to 6 base36 chars>`. */
export function newTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A new `attempts.id`: `att-<epochSeconds>-<up to 4 base36 chars>`. */
export function newAttemptId(): string {
  return newSecondsId("att");
}

/** A new `conversations.id`: `conv-<epochSeconds>-<up to 4 base36 chars>`. */
export function newConversationId(): string {
  return newSecondsId("conv");
}

// Three independent id namespaces, each self-describing in logs and URLs.
// Legacy rows may still carry the pre-rename `claude-…` prefix; matchers that
// surface live sessions accept both.
function newSecondsId(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Math.floor(Date.now() / 1000)}-${suffix}`;
}
