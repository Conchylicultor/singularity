import type { FieldDef, SortPreset, SortRule } from "../../core";

/**
 * Pure helpers for the saved sort presets feature. Kept dependency-free
 * (no React, no config_v2) so they unit-test in isolation and stay reusable.
 */

/** Coerce a raw direction value to the `"asc" | "desc"` union (default asc). */
function coerceDirection(raw: unknown): "asc" | "desc" {
  return raw === "desc" ? "desc" : "asc";
}

/**
 * Read + normalize the raw config `sortPresets` value into `SortPreset[]`.
 *
 * The config listField injects an `id`/`rank` onto each preset row AND each rule
 * row; we keep the preset `id` (the delete/rename target) but **strip** it from
 * the rules (a `SortRule` is `{ fieldId, direction }` only). Terse/legacy/absent
 * input tolerated: a missing preset `id` falls back to a stable index-derived id,
 * a non-array (or missing) top-level value yields `[]`, and a row missing
 * `label`/`rules` is skipped.
 */
export function readSortPresets(raw: unknown): SortPreset[] {
  if (!Array.isArray(raw)) return [];
  const presets: SortPreset[] = [];
  raw.forEach((row, index) => {
    if (typeof row !== "object" || row === null) return;
    const r = row as Record<string, unknown>;
    if (typeof r.label !== "string") return;
    const id = typeof r.id === "string" && r.id !== "" ? r.id : `preset-${index}`;
    const rawRules = Array.isArray(r.rules) ? r.rules : [];
    const rules: SortRule[] = [];
    for (const rawRule of rawRules) {
      if (typeof rawRule !== "object" || rawRule === null) continue;
      const rule = rawRule as Record<string, unknown>;
      if (typeof rule.fieldId !== "string") continue;
      rules.push({
        fieldId: rule.fieldId,
        direction: coerceDirection(rule.direction),
      });
    }
    presets.push({ id, label: r.label, rules });
  });
  return presets;
}

/**
 * Filter a preset's rules to those whose field still resolves (dangling-safe):
 * used both for apply (write only resolvable rules into the live sort) and for
 * the resolvable-count display in the preset row.
 */
export function resolvableRules<TRow>(
  rules: SortRule[],
  sortableFields: FieldDef<TRow>[],
): SortRule[] {
  const byId = new Set(sortableFields.map((f) => f.id));
  return rules.filter((r) => byId.has(r.fieldId));
}

/**
 * True when `rules` equal a preset's rules by ordered `(fieldId, direction)` —
 * the active-indicator predicate (the live sort exactly matches the preset).
 */
export function presetMatchesRules(
  preset: SortPreset,
  rules: SortRule[],
): boolean {
  if (preset.rules.length !== rules.length) return false;
  return preset.rules.every((pr, i) => {
    const lr = rules[i];
    return (
      lr !== undefined &&
      pr.fieldId === lr.fieldId &&
      pr.direction === lr.direction
    );
  });
}
