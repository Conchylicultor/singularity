import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  assertSupportedHost,
  readPid,
  isRunning,
  isGatewayListening,
  awaitGatewayReady,
  hasPgBouncerPackage,
  pgbouncerService,
  pgbouncerConnection,
  ensureDatabaseConfig,
  writeReleaseDatabaseConfig,
  buildOrLocateGateway,
  spawnGatewayDaemon,
  gatewayLaunchSpec,
  awaitProcessGone,
  terminateProcess,
  awaitPgReady,
  bootSelfContainedApp,
  seedReleaseAssetMirror,
  propagateReleaseConfig,
  teardownSelfContainedApp,
  gatewayPidFile,
} from "./internal/boot";
export type { GatewayLaunchOptions } from "./internal/boot";
export {
  GATEWAY_SERVICE_LABEL,
  supportsLoginService,
  gatewayServicePlistPath,
  gatewayServiceState,
  writeGatewayServicePlist,
  removeGatewayServicePlist,
  bootstrapGatewayService,
  bootoutGatewayService,
} from "./internal/login-service";
export type { GatewayServiceState } from "./internal/login-service";
export {
  LISTEN_ENV,
  resolveListenAddress,
  listenFlag,
} from "./internal/listen";
export type { ListenAddress } from "./internal/listen";

export default {} satisfies ServerPluginDefinition;
