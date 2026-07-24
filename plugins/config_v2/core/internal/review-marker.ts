/**
 * The one-line review marker a build-time seeder inserts into a config override
 * it produced or re-stamped (`config/<tree>/<name>.jsonc`). Its presence means
 * "the values below are machine-produced, not yet deliberate" — the author
 * arranges them and deletes the line, which is the whole review gate.
 *
 * Kept here, next to `computeHash`, because BOTH ends of the gate need it and
 * neither may re-spell it: the build-time writer (codegen's seeder) and the
 * marker-scanning check. The marker is a JSONC comment, so it never reaches the
 * parsed document or its `@hash`.
 */
export const REVIEW_MARKER = "// @review";

// Anchored per-line so the marker only counts as its own comment line — a
// `@review` mentioned inside a body comment or a string never trips the gate.
const REVIEW_MARKER_RE = /^\/\/ @review\b/m;

/** True when `fileText` carries the review-marker line. */
export function hasReviewMarker(fileText: string): boolean {
  return REVIEW_MARKER_RE.test(fileText);
}
