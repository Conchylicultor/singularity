import { isMain } from "@plugins/infra/plugins/runtime-identity/core";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import { getMainRepoRoot } from "@plugins/infra/plugins/spawn/core";
import { isReportKindRegistered, recordReport } from "@plugins/reports/server";
import { reportOutboxDir } from "../../data-dirs";
import { drainOutbox, type DrainDeps } from "./drain";
import { checkStaleness } from "./staleness";

let watcher: FileWatcher | null = null;
// Passes are serialized: two overlapping passes would both read an entry
// before either deleted it, and record it twice. A flag pair rather than a
// promise chain: a rejected chain would short-circuit and silently disarm every
// future pass for the rest of the process's life.
let draining = false;
let rerun = false;

async function productionDeps(): Promise<DrainDeps> {
  const root = await getMainRepoRoot(REPO_ROOT);
  return {
    dir: reportOutboxDir.path,
    record: async (entry) => {
      await recordReport({
        kind: entry.kind,
        source: "cli",
        message: entry.message,
        data: entry.data,
        occurredAt: entry.occurredAt,
      });
    },
    recordFailure: async (error) => {
      await recordReport({
        kind: "crash",
        source: "server-caught",
        message: error.message,
        data: { errorType: error.name, stack: error.stack ?? null },
      });
    },
    isKnownKind: isReportKindRegistered,
    checkStaleness: (code) => checkStaleness(code, { root, mainRef: "main" }),
    log: (line) => console.warn(line),
  };
}

function scheduleDrain(): void {
  if (draining) {
    // A write landed mid-pass: the pass in flight listed the directory before
    // it, so one more pass is owed.
    rerun = true;
    return;
  }
  draining = true;
  // No `.catch`: the drain turns every per-entry failure into a report itself,
  // so anything escaping is unexpected and must surface as an unhandled
  // rejection. The `finally` keeps one throw from disarming later passes.
  void runTracked("report-outbox:drain", async () => {
    try {
      await drainOutbox(await productionDeps());
    } finally {
      draining = false;
      if (rerun) {
        rerun = false;
        scheduleDrain();
      }
    }
  });
}

/**
 * Start draining the report outbox: once now (whatever piled up while main was
 * down), then on every change in the directory. No timer — a write IS the
 * signal.
 *
 * Main-only: the outbox is host-global, and one reader is the whole design. A
 * worktree backend draining it too would race main for the same entries and
 * file every report under its own namespace.
 */
export async function startReportOutbox(): Promise<void> {
  if (!isMain()) return;
  if (watcher) return;
  const dir = reportOutboxDir.ensure();
  watcher = await createFileWatcher({
    dirs: [dir],
    name: "report-outbox",
    onChange: () => scheduleDrain(),
  });
  // After subscribing, so an entry written between the first pass's listing
  // and the subscription is not missed.
  scheduleDrain();
}

export async function stopReportOutbox(): Promise<void> {
  if (!watcher) return;
  await watcher.stop();
  watcher = null;
}
