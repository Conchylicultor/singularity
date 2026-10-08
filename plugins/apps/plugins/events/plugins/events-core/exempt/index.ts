import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "events/no-raw-events-write",
    paths: ["server/internal/events-repo.ts"],
    kind: "sanctioned",
    reason:
      "`events-repo.ts` IS the funnel — it owns the sighting stamps and write shapes every other writer must route through.",
  },
  {
    rule: "ids:pk-declared",
    paths: ["server/internal/tables.ts"],
    kind: "debt",
    task: "task-1791405297096-jyzsmk",
    reason:
      "Phase-1 baseline of the unified prefixed ids: this table's `id` primary key names no id kind yet. Declare the kind (`defineIdKind`) and key the table with `idColumn` / `idKindField` (or `externalIdColumn` for an id minted elsewhere) in its migration phase, then delete this entry.",
  },
] satisfies Exemptions;
