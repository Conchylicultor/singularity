import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { awaitDbReady } from "@plugins/database/server";
import { migrationsReady } from "@plugins/database/plugins/migrations/server";
import { bootSnapshot } from "../core";
import { handleBootSnapshot } from "./internal/handle-boot-snapshot";
import { warmBootResources } from "./internal/boot-keys";

export default {
  description:
    "Single-request boot snapshot of all boot-critical resources, hydrated client-side before first paint; server-side buffer-cache warm-up behind the readiness barrier.",
  loadBearing: false,
  httpRoutes: {
    [bootSnapshot.route]: handleBootSnapshot,
  },
  // Phase C — server buffer-cache warm-up. Runs the boot-critical loaders once
  // behind the readiness barrier so PG's buffer cache (and the connection pool)
  // is warm for the boot-critical tables BEFORE the gateway hot-swaps to this
  // backend — moving the cold first-execution cost off the user path.
  //
  // `onReadyBlocking` hooks run in PARALLEL (server-core/bin/index.ts), so we
  // can't rely on the database plugin's own barrier having finished — we
  // explicitly await `awaitDbReady` + `migrationsReady` here. The warm-up itself
  // (`warmBootResources`) is best-effort and time-boxed so a pathological loader
  // can never hold the barrier open past its budget.
  async onReadyBlocking() {
    await awaitDbReady();
    await migrationsReady;
    await warmBootResources();
  },
} satisfies ServerPluginDefinition;
