import type { CustomColumnDef } from "../../core";

/**
 * Pure reader: normalize the raw config `customColumns` value into
 * `CustomColumnDef[]`. Kept dependency-free (no React, no config_v2), mirroring
 * `readSortPresets`.
 *
 * Terse/legacy/absent input is tolerated: a non-array yields `[]`; a row missing
 * a string `label` is skipped; a missing/empty `id` falls back to a stable
 * index-derived id; a missing/empty `type` defaults to `"text"`.
 */
export function readCustomColumnDefs(raw: unknown): CustomColumnDef[] {
  if (!Array.isArray(raw)) return [];
  const defs: CustomColumnDef[] = [];
  raw.forEach((row, index) => {
    if (typeof row !== "object" || row === null) return;
    const r = row as Record<string, unknown>;
    if (typeof r.label !== "string") return;
    const id = typeof r.id === "string" && r.id !== "" ? r.id : `cc-${index}`;
    const type = typeof r.type === "string" && r.type !== "" ? r.type : "text";
    defs.push({ id, label: r.label, type });
  });
  return defs;
}
