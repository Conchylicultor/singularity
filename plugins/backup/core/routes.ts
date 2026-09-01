import { defineRoute } from "@plugins/primitives/plugins/pane/core";

/**
 * The backup panel, and one backup run under it.
 *
 * `defineRoute({ id })` IS the pane id, so `id: "backup"` reproduces the pane id
 * the panel has always had — the `slots` record and the Debug sidebar entry keep
 * working unchanged.
 *
 * The segment is a bare `"backup"`, not the `"debug/backup"` it used to be.
 * `debugApp.basePath` is already `/debug`, so the old spelling parked the panel
 * at `/debug/debug/backup` while every sibling debug pane (`health`, `logs`,
 * `profiling`, `boot-profile`) uses a bare segment. Left alone the doubled
 * segment would be baked into every link to a run as well. **This breaks
 * existing `/debug/debug/backup` bookmarks** — a deliberate cost, paid once, in
 * a debug app.
 *
 * `br/` rather than `r/`: pane segments are globally unique across every
 * registered pane after param-name erasure, and `r/:runId` is build's,
 * `run/:runId` is the events app's, `rel/:runId` is Studio's release. The
 * initial is this ledger's.
 */
export const backupRoute = defineRoute({ id: "backup", segment: "backup" });

export const backupRunRoute = defineRoute({
  id: "backup-run",
  segment: "br/:runId",
  parent: backupRoute,
});
