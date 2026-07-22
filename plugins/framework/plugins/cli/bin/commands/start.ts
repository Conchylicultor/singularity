import type { Command } from "commander";
import { join } from "path";
import { getMainRepoRoot } from "@plugins/infra/plugins/spawn/core";
import { SINGULARITY_DIR } from "../paths";
import {
  readPid,
  isRunning,
  isGatewayListening,
  ensureDatabaseConfig,
  buildOrLocateGateway,
  spawnGatewayDaemon,
} from "@plugins/infra/plugins/launcher/server";

const LOGS_DIR = join(SINGULARITY_DIR, "logs");

// The dev gateway always listens on the default port.
const DEFAULT_PORT = 9000;

export function registerStart(program: Command) {
  program
    .command("start")
    .description("Build and start the gateway daemon")
    .option("--force", "Restart even if already running")
    .option(
      "--log-level <level>",
      "Gateway log level: debug|info|warn|error",
      "info",
    )
    .action(async (opts: { force?: boolean; logLevel: string }) => {
      const existingPid = readPid();
      const pidAlive = existingPid !== null && isRunning(existingPid);

      if (!pidAlive && (await isGatewayListening(DEFAULT_PORT))) {
        console.log("Gateway is already running on port 9000 (started externally).");
        console.log("  Gateway: http://singularity.localhost:9000");
        console.log(`  Logs:    ${LOGS_DIR}/`);
        return;
      }

      if (pidAlive) {
        if (!opts.force) {
          console.log(`Gateway is already running (PID ${existingPid})`);
          console.log(`  Logs:    ${LOGS_DIR}/`);
          console.log(`  Gateway: http://singularity.localhost:9000`);
          return;
        }
        console.log(`Stopping existing gateway (PID ${existingPid})...`);
        try {
          process.kill(existingPid!, "SIGTERM");
        // eslint-disable-next-line promise-safety/no-bare-catch
        } catch {}
        // Wait for the old gateway to actually exit before spawning the
        // replacement. A fixed sleep let the old gateway keep tearing down its
        // backends while the new one booted and ran its orphan reconcile —
        // overlapping generations, the routine trigger for orphaned backends.
        // Poll until the pid is gone, bounded to the gateway's own 15s shutdown
        // budget.
        const stopDeadline = Date.now() + 15_000;
        while (isRunning(existingPid!) && Date.now() < stopDeadline) {
          await Bun.sleep(100);
        }
        if (isRunning(existingPid!)) {
          console.warn(
            `Existing gateway (PID ${existingPid}) still running after 15s; continuing.`,
          );
        }
      }

      const repoRoot = await getMainRepoRoot();

      // Dev `start` always rebuilds the shared gateway (forceBuild): it is the
      // only path that compiles the gateway, so a Go source change must take
      // effect here. The skip-if-exists fast path is reserved for the release
      // launcher (a vendored prebuilt binary, no Go toolchain on the host).
      const { gatewayDir, gatewayBin } = await buildOrLocateGateway(
        repoRoot,
        console.log,
        true,
      );

      ensureDatabaseConfig(repoRoot, console.log);

      const pid = spawnGatewayDaemon({
        gatewayDir,
        gatewayBin,
        port: DEFAULT_PORT,
        logLevel: opts.logLevel,
      });

      console.log(`Gateway started (PID ${pid})`);
      console.log(`  Logs:    ${LOGS_DIR}/`);
      console.log(`  Gateway: http://singularity.localhost:9000`);
    });
}
