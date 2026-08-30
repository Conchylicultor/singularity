import { defineRunArmFields } from "@plugins/runs/core";
import { BACKUP_RUN_KIND } from "./kind";

/**
 * The columns only a backup run has.
 *
 * One declaration, read by both runtimes: `defineRunKind` demands a column
 * expression for exactly these keys, and `runArmFields` demands that any web
 * `FieldDef` binding one of them agrees about its type. A field id that drifts
 * off its server column does not fail — it silently degrades into
 * client-side-only filtering over the loaded window — so the binding is what
 * makes this arm's filters real SQL.
 *
 * `backup.status` is the arm's **native** status, kept beside the shared
 * `outcome` rather than instead of it. It is also the reason the shared
 * vocabulary has a `partial` at all: a backup that reached three of four
 * targets is neither a success nor a failure, and backup is the only kind that
 * can end up there.
 *
 * `backup.targetResults` and `backup.sources` are the raw jsonb columns,
 * declared here so the row renderer can carry what the hand-rolled backup card
 * carried and no scalar column can: *which* target failed and what it said, and
 * what actually went into the archive. Neither has a `FieldDef` — a blob has no
 * comparable projection, so it is data the row reads, never a dimension the
 * table sorts by. Both are bounded by things a person configures (storage
 * targets, backup sources), not by the ledger's size.
 */
export const backupRunFields = defineRunArmFields(BACKUP_RUN_KIND, {
  /** `running` / `ok` / `partial` / `failed` — the arm's own vocabulary. */
  "backup.status": { type: "enum", sqlType: "text" },
  /** Archive bytes. Null while the run has not produced an archive yet. */
  "backup.archiveSize": { type: "number", sqlType: "integer", nullable: true },
  /** Sources that actually went in (skipped ones excluded). Null pre-manifest. */
  "backup.sourceCount": { type: "number", sqlType: "integer", nullable: true },
  /** Storage targets dispatched to. Null until the run has dispatched. */
  "backup.targetCount": { type: "number", sqlType: "integer", nullable: true },
  /** Per-target outcomes, verbatim. Read by the row, never filtered on. */
  "backup.targetResults": { type: "json", sqlType: "jsonb", nullable: true },
  /**
   * The manifest's source reports (v2 array form only — see the server's
   * `jsonb_typeof` guard). Read by the row, never filtered on.
   */
  "backup.sources": { type: "json", sqlType: "jsonb", nullable: true },
});
