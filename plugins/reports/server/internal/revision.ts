import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { reportsRevisionResource as descriptor } from "../../core";

// The `reports.revision` tick behind the Reports DataView and detail pane.
//
// The `reports` table is excluded from the change feed, so nothing invalidates a
// reader from the database side. Instead every path that makes a durable change a
// reader would see calls `bumpReportsRevision()`: recordReport after a
// non-rate-limited upsert (duress-buffered and on-disk-buffered reports replay
// through it, so they bump when they land), investigateReport after linking a
// task, and the boot-time noise backfill when it flips a flag.
//
// An in-process counter, not a DB read — the loader never touches the table, so a
// crash storm costs a counter increment per report and, through `debounceMs`, at
// most one push (and so one page refetch per open pane) per 2 s. A write from a
// DIFFERENT process (none today: every writer runs in this backend) would not move
// it; the reader's own fetch on open is the backstop.
let rev = 0;

export const reportsRevisionServerResource = defineExternalResource(
  descriptor,
  {
    mode: "push",
    debounceMs: 2000,
    loader: () => Promise.resolve({ rev }),
  },
);

export function bumpReportsRevision(): void {
  rev++;
  reportsRevisionServerResource.notify();
}
