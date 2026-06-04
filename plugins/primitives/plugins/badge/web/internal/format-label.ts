/**
 * THE sanctioned identifier→label transform for badge/chip content.
 *
 * Converts an enum/identifier key (snake_case, kebab-case, or a single word) to
 * a sentence-case display label: separators collapse to single spaces, the first
 * character is upper-cased, the rest lower-cased.
 *
 *   formatStatusLabel("in_progress")     === "In progress"
 *   formatStatusLabel("need_action")     === "Need action"
 *   formatStatusLabel("working")         === "Working"
 *   formatStatusLabel("general-purpose") === "General purpose"
 *
 * This is the only place an enum key becomes display text — call sites must NOT
 * hand-roll `.replace(/_/g, " ")` or lean on CSS `capitalize`/`uppercase`
 * (banned by the `badge/no-badge-text-transform` lint rule). Proper nouns
 * (model names like "Opus 4.8", user-typed text, counts) are verbatim content
 * and must NOT pass through this — render them as-is.
 */
export function formatStatusLabel(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim().toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : spaced;
}
