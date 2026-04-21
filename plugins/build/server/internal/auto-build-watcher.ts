import { getLatestPush } from "@plugins/tasks-core/server";
import { readConfig } from "@plugins/config/server";
import { buildConfig } from "../../shared/config";
import { isBuildInflight, runBuild } from "./run-build";

const POLL_MS = 2000;

let initialized = false;
let lastPushId: string | null = null;
export let lastAutoBuildAt: string | null = null;

// `runBuild()` coalesces overlapping calls internally, so even if two ticks
// race past the early-return (both pass through the awaits concurrently)
// they end up awaiting the same build. `lastPushId` is only advanced once
// we commit to triggering a build, so pushes that arrive during an in-flight
// build still get a follow-up build on a later tick.
async function tick() {
  if (isBuildInflight()) return;

  const latest = await getLatestPush();
  const latestId = latest?.id ?? null;

  if (!initialized) {
    initialized = true;
    lastPushId = latestId;
    return;
  }

  if (latestId === lastPushId) return;

  const { autoBuild } = await readConfig(buildConfig);
  if (!autoBuild) return;

  if (isBuildInflight()) return;

  lastPushId = latestId;
  lastAutoBuildAt = new Date().toISOString();
  runBuild().catch(() => {});
}

export function startAutoBuildWatcher() {
  setInterval(() => {
    tick().catch((err) => console.error("[build.auto-watcher]", err));
  }, POLL_MS);
}
