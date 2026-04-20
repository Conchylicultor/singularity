import { getLatestPush } from "@plugins/tasks-core/server";
import { readConfig } from "@plugins/config/server";
import { buildConfig } from "../../shared/config";
import { runBuild } from "./run-build";

const POLL_MS = 2000;

let initialized = false;
let lastPushId: string | null = null;
let building = false;
export let lastAutoBuildAt: string | null = null;

async function tick() {
  if (building) return;

  const latest = await getLatestPush();
  const latestId = latest?.id ?? null;

  if (!initialized) {
    initialized = true;
    lastPushId = latestId;
    return;
  }

  if (latestId === lastPushId) return;
  lastPushId = latestId;

  const { autoBuild } = await readConfig(buildConfig);
  if (!autoBuild) return;

  building = true;
  lastAutoBuildAt = new Date().toISOString();
  runBuild().finally(() => {
    building = false;
  });
}

export function startAutoBuildWatcher() {
  setInterval(() => {
    tick().catch((err) => console.error("[build.auto-watcher]", err));
  }, POLL_MS);
}
