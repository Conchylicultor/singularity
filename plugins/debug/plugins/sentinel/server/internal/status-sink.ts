import type { SentinelStatus } from "@plugins/debug/plugins/sentinel/plugins/status-file/core";
import { createStatusWriter } from "@plugins/debug/plugins/sentinel/plugins/status-file/server";

export type DownStatus = Extract<SentinelStatus, { state: "down" }>;

/**
 * Where main's watcher host sends every supervision transition: the host-global
 * status file (every backend's health row reads it), and — on `down` — the
 * `sentinel-down` report (bell, Debug → Reports, Timeline).
 *
 * The report is filed before the file is written, so a failing write cannot
 * swallow the one signal that must land.
 */
export function createStatusSink(opts: {
  dir: string;
  pid?: number;
  reportDown: (status: DownStatus) => void;
}): (status: SentinelStatus) => void {
  const write = createStatusWriter(opts.dir, opts.pid);
  return (status) => {
    if (status.state === "down") opts.reportDown(status);
    write(status);
  };
}
