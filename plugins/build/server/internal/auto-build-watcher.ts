import { db } from "../../../../server/src/db/client";
import { pushes } from "@plugins/tasks/server/api";
import { desc } from "drizzle-orm";
import { readConfig } from "@plugins/config/server/api";
import { buildConfig } from "../../shared/config";
import { runBuild } from "./run-build";

const POLL_MS = 2000;

let initialized = false;
let lastPushId: string | null = null;
let building = false;
export let lastAutoBuildAt: string | null = null;

async function tick() {
  if (building) return;

  const [latest] = await db
    .select({ id: pushes.id })
    .from(pushes)
    .orderBy(desc(pushes.createdAt))
    .limit(1);

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
