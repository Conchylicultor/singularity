import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * Stop the gateway daemon `./singularity start` left running. On macOS the
 * gateway is a launchd service that relaunches when it dies, so killing its pid
 * is not a stop — this is. A system-level operation like `start`: never part of
 * the agent workflow.
 */
export default defineCliCommand<[], { disable?: boolean }>({
  name: "stop",
  description: "Stop the gateway daemon",
  options: [
    {
      flags: "--disable",
      description: "Also stop it from starting at login (macOS)",
    },
  ],
  run: () => import("./run"),
});
