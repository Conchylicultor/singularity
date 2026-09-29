import type { ReactElement } from "react";
import {
  Pane,
  PaneChrome,
  type ResolveResult,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useRun } from "@plugins/runs/web";
import { BACKUP_RUN_KIND, backupRoute, backupRunRoute } from "../core";
import { BackupPanel } from "./components/backup-panel";
import { BackupRunDetail } from "./slots";

export const backupPane = Pane.define({
  title: "Backup",
  route: backupRoute,
  app: debugApp,
  component: BackupBody,
});

export const backupRunPane = Pane.define({
  title: "Backup Run",
  route: backupRunRoute,
  app: debugApp,
  component: BackupRunBody,
  width: 480,
  useResolve: useResolveBackupRun,
});

/**
 * Whether the URL's run exists — a real resolve, not a `useResolve: false` opt-out.
 *
 * This is what a by-id read of the merged run space buys. `buildDetailPane`
 * opts out because it has no such read — it can only look for its row inside a
 * loaded window — so its miss surfaces as a string somewhere in the body. Here
 * the pane primitive paints its own Loading and Not Found chrome, and a stale
 * deep link is answered once rather than by every section separately.
 *
 * A failed read is the guard's error arm — the failure in place of the pane,
 * never the Not Found chrome for a run that may well exist.
 */
function useResolveBackupRun({ runId }: { runId: string }): ResolveResult {
  // The by-id read already answers in the resolve vocabulary.
  return useRun({ kind: BACKUP_RUN_KIND, id: runId });
}

function BackupBody(): ReactElement {
  // Which row is OPEN is this pane's own knowledge and nothing else can supply
  // it. Where a row GOES is not: that belongs to the arm's `Runs.Kind.open`,
  // which pushes the detail pane from whichever surface the row was clicked in.
  const selectedRunId = backupRunPane.useRouteEntry()?.params.runId;

  return (
    <PaneChrome pane={backupPane}>
      <BackupPanel selectedRunId={selectedRunId} />
    </PaneChrome>
  );
}

function BackupRunBody(): ReactElement {
  const { runId } = backupRunPane.useParams();
  const state = useRun({ kind: BACKUP_RUN_KIND, id: runId });

  // The resolve guard has already answered "does this run exist" before this
  // body mounts, so the only way to be here without a row is its sticky path: a
  // pane that HAS resolved, re-reading after its cache entry went away. That is
  // a loading state, never an empty one — the sections are handed a run or they
  // are not rendered at all.
  return (
    <PaneChrome pane={backupRunPane}>
      {state.status === "found" ? (
        <BackupRunDetail.Host run={state.run} />
      ) : (
        <Loading />
      )}
    </PaneChrome>
  );
}
