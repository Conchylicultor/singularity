import { writeFileSync } from "node:fs";
import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { assertPrerequisites } from "@plugins/framework/plugins/cli/plugins/doctor/cli";
import { getMainRepoRoot } from "@plugins/infra/plugins/spawn/core";
import { gatewayLogs } from "@plugins/infra/plugins/launcher/data-dirs";
import {
  MAIN_WORKTREE_NAME,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";
import {
  assertSupportedHost,
  readPid,
  isRunning,
  isGatewayListening,
  ensureDatabaseConfig,
  buildOrLocateGateway,
  spawnGatewayDaemon,
  gatewayLaunchSpec,
  awaitGatewayReady,
  awaitProcessGone,
  terminateProcess,
  supportsLoginService,
  gatewayServiceState,
  writeGatewayServicePlist,
  bootstrapGatewayService,
  bootoutGatewayService,
  GATEWAY_SERVICE_LABEL,
  type GatewayLaunchOptions,
} from "@plugins/infra/plugins/launcher/server";

// The dev gateway always listens on the default port.
const DEFAULT_PORT = 9000;

type Opts = { force?: boolean; logLevel: string };

const run: CliAction<[], Opts> = async (opts) => {
  // Every missing dev prerequisite at once, before the gateway compile.
  await assertPrerequisites();
  // Same host preconditions as a release launch: the dev gateway supervises
  // the same embedded cluster, so the same machine facts have to hold.
  assertSupportedHost();

  if (supportsLoginService()) await startAsLoginService(opts);
  else await startDetached(opts);
};

/**
 * macOS: the gateway is a launchd LaunchAgent, so it comes back at login after a
 * reboot and is relaunched if it dies. launchd owns the process; this command
 * (re)writes the job, (re)loads it, and waits for it to serve.
 */
async function startAsLoginService(opts: Opts): Promise<void> {
  const service = await gatewayServiceState();
  const managedPid = service.kind === "loaded" ? service.pid : null;
  const pidfilePid = readPid();
  // A gateway launchd does not own: started by a `start` from before the
  // gateway was a launchd service.
  const legacyPid =
    pidfilePid !== null && pidfilePid !== managedPid && isRunning(pidfilePid)
      ? pidfilePid
      : null;

  if (managedPid !== null && !opts.force) {
    printRunning(
      `Gateway is already running under launchd (PID ${managedPid})`,
    );
    return;
  }
  if (
    managedPid === null &&
    legacyPid === null &&
    (await isGatewayListening(DEFAULT_PORT))
  ) {
    printRunning(
      "Gateway is already running on port 9000 (started externally).",
    );
    return;
  }

  const spec = gatewayLaunchSpec(await prepareGateway(opts));
  const plist = writeGatewayServicePlist(spec);
  console.log(
    `Registered ${GATEWAY_SERVICE_LABEL} with launchd (${plist.path})`,
  );

  if (legacyPid !== null) {
    if (!opts.force) {
      // Registering is enough for the next login; swapping the live gateway
      // restarts every backend, which only an explicit --force asks for.
      console.log(
        `The running gateway (PID ${legacyPid}) was started before it was a launchd service. It keeps running now, and launchd starts it from the next login on. Run \`./singularity start --force\` to hand it to launchd now.`,
      );
      return;
    }
    console.log(
      `Stopping the gateway started outside launchd (PID ${legacyPid})...`,
    );
    await terminateProcess(legacyPid);
  }

  if (service.kind === "loaded") {
    // Unload rather than `kickstart`: launchd reads a plist only when it is
    // bootstrapped, so a rewritten job takes effect only through a reload.
    console.log("Reloading the launchd job...");
    await bootoutGatewayService();
    if (managedPid !== null) await awaitProcessGone(managedPid);
  }

  // launchd appends; truncate so the tail quoted on a failed start is this boot's.
  writeFileSync(spec.stdioLog, "");
  const pid = await bootstrapGatewayService();
  await awaitGatewayReady({ pid, port: DEFAULT_PORT });
  printRunning(
    `Gateway started under launchd (PID ${pid}); it starts again at every login`,
  );
}

/**
 * Hosts without launchd: the detached spawn. It does not survive a reboot —
 * run `./singularity start` again after one.
 */
async function startDetached(opts: Opts): Promise<void> {
  const existingPid = readPid();
  const pidAlive = existingPid !== null && isRunning(existingPid);

  if (!pidAlive && (await isGatewayListening(DEFAULT_PORT))) {
    printRunning(
      "Gateway is already running on port 9000 (started externally).",
    );
    return;
  }

  if (pidAlive) {
    if (!opts.force) {
      printRunning(`Gateway is already running (PID ${existingPid})`);
      return;
    }
    console.log(`Stopping existing gateway (PID ${existingPid})...`);
    await terminateProcess(existingPid!);
  }

  const launch = await prepareGateway(opts);
  // `.pid` only, and no `.ref()`: the gateway deliberately outlives `start`.
  const { pid } = spawnGatewayDaemon(launch);

  // Wait for the gateway to actually serve before claiming success. It exits
  // when a managed service fails to start, so printing unconditionally
  // reported success for an already-dead gateway.
  await awaitGatewayReady({ pid, port: DEFAULT_PORT });
  printRunning(`Gateway started (PID ${pid})`);
  console.log(
    "  Not registered with a service manager on this OS: run `./singularity start` again after a reboot.",
  );
}

/** Compile the gateway and write `database.json` — the inputs to any launch. */
async function prepareGateway(opts: Opts): Promise<GatewayLaunchOptions> {
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
  return {
    gatewayDir,
    gatewayBin,
    port: DEFAULT_PORT,
    logLevel: opts.logLevel,
  };
}

function printRunning(headline: string): void {
  console.log(headline);
  console.log(`  Logs:    ${gatewayLogs.path}/`);
  console.log(`  Gateway: ${namespaceUrl(MAIN_WORKTREE_NAME)}`);
}

export default run;
