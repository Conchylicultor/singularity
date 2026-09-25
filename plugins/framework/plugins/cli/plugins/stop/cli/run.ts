import type { CliAction } from "@plugins/framework/plugins/cli/core";
import {
  readPid,
  isRunning,
  awaitProcessGone,
  terminateProcess,
  supportsLoginService,
  gatewayServiceState,
  bootoutGatewayService,
  removeGatewayServicePlist,
  gatewayServicePlistPath,
} from "@plugins/infra/plugins/launcher/server";

const run: CliAction<[], { disable?: boolean }> = async (opts) => {
  let stopped = false;

  if (supportsLoginService()) {
    const service = await gatewayServiceState();
    if (service.kind === "loaded") {
      console.log(
        `Stopping the gateway launchd service${service.pid !== null ? ` (PID ${service.pid})` : ""}...`,
      );
      await bootoutGatewayService();
      if (service.pid !== null) await awaitProcessGone(service.pid);
      stopped = true;
    }
  }

  // A gateway no service manager owns: a `start` without launchd, or one from
  // before the gateway was a launchd service.
  const pid = readPid();
  if (pid !== null && isRunning(pid)) {
    console.log(`Stopping the gateway (PID ${pid})...`);
    await terminateProcess(pid);
    stopped = true;
  }

  console.log(stopped ? "Gateway stopped." : "Gateway is not running.");

  if (!supportsLoginService()) return;
  if (opts.disable) {
    console.log(
      removeGatewayServicePlist()
        ? `Removed ${gatewayServicePlistPath()}: it no longer starts at login. \`./singularity start\` registers it again.`
        : "It was not registered to start at login.",
    );
  } else {
    console.log(
      "It starts again at the next login (`./singularity stop --disable` to prevent that), or now with `./singularity start`.",
    );
  }
};

export default run;
