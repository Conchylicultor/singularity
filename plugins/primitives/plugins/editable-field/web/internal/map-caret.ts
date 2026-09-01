/**
 * Where an offset in `prev` lands once the text becomes `next`.
 *
 * Adopting an external value into a focused field must not throw the caret to
 * the end of the text. React DOM restores the raw numeric offsets across a
 * commit, which is right only when the edit landed after the caret; this maps
 * the offset through the actual change instead:
 *
 * - before the changed region → unchanged
 * - after it → shifted by the length delta (distance from the end is kept)
 * - inside it → clamped to the end of the replacement (the text the caret sat
 *   in no longer exists, so the end of what replaced it is the honest answer)
 *
 * Pure string math, so the policy is testable without a DOM.
 */
export function mapCaret(prev: string, next: string, offset: number): number {
  const at = Math.max(0, Math.min(offset, prev.length));

  let prefix = 0;
  const maxPrefix = Math.min(prev.length, next.length);
  while (prefix < maxPrefix && prev[prefix] === next[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(prev.length - prefix, next.length - prefix);
  while (
    suffix < maxSuffix &&
    prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }

  if (at <= prefix) return at;
  if (at >= prev.length - suffix) return next.length - (prev.length - at);
  return next.length - suffix;
}
