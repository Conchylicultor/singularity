import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  readPid,
  isRunning,
  isGatewayListening,
  hasPgBouncerPackage,
  pgbouncerService,
  pgbouncerConnection,
  ensureDatabaseConfig,
  writeReleaseDatabaseConfig,
  buildOrLocateGateway,
  spawnGatewayDaemon,
  awaitPgReady,
  bootSelfContainedApp,
  teardownSelfContainedApp,
  gatewayPidFile,
  zeroCacheEnabled,
  zeroCacheSpec,
} from "./internal/boot";

export default {
} satisfies ServerPluginDefinition;
