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
  seedReleaseAssetMirror,
  seedReleaseConfig,
  teardownSelfContainedApp,
  gatewayPidFile,
  zeroCacheSpec,
} from "./internal/boot";

export default {
} satisfies ServerPluginDefinition;
