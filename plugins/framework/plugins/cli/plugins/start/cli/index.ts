import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * The one command that deliberately leaves something running after it exits —
 * the gateway daemon, spawned detached.
 *
 * It is NOT `detachable`, though: what outlives the shell is the daemon, not
 * this process. `start` itself only builds the gateway, spawns it, and waits for
 * it to answer, so the orphan guard killing it when its invoking shell dies is
 * exactly right — an orphaned readiness wait has nobody left to report to.
 *
 * A system-level, one-time operation: never part of the normal agent workflow.
 */
export default defineCliCommand<[], { force?: boolean; logLevel: string }>({
  name: "start",
  description: "Build and start the gateway daemon",
  options: [
    { flags: "--force", description: "Restart even if already running" },
    {
      flags: "--log-level <level>",
      description: "Gateway log level: debug|info|warn|error",
      defaultValue: "info",
    },
  ],
  run: () => import("./run"),
});
