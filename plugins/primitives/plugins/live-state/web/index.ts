import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  NotificationsProvider,
  ensureNotificationsClient,
  useResource,
  hydrateResource,
  hydrateQuery,
  useNotificationsStatus,
  useNotificationsChannelStatuses,
  useNotificationsClient,
  getNotificationsClient,
} from "./use-resource";
export { hydrateEndpoint } from "./hydrate-endpoint";
export { slowResourceReportSink } from "./slow-resource-reporter";
export type { SlowResourceInfo } from "./slow-resource-reporter";
export { updateDelayReportSink } from "./update-delay-reporter";
export type { UpdateDelayInfo } from "./update-delay-reporter";
export {
  pendingMountSnapshot,
  subscribePendingMounts,
} from "./pending-mount-tracker";
export type { PendingMountSnapshot } from "./pending-mount-tracker";
export type { ResourceResult } from "./use-resource";
export { combineResources, useCombinedResources } from "./resource-utils";
export type {
  GateInput,
  GateDataOf,
  CombinedResources,
} from "./resource-utils";
export { matchResource, ResourceView } from "./components/resource-view";
export type {
  MatchResourceHandlers,
  ResourceViewProps,
} from "./components/resource-view";
export {
  NotificationsClient,
  queryKeyFor,
  liveStateSocketKind,
  ResourceStaleReadError,
} from "./notifications-client";
export {
  noteResourceWatermark,
  getResourceWatermark,
} from "./watermark-registry";
export {
  noteResourceTxAcks,
  hasResourceTxAck,
  subscribeResourceTxAcks,
} from "./tx-ack-registry";
export { httpStaleDropReportSink } from "./stale-drop-reporter";
export type { HttpStaleDropReport } from "./stale-drop-reporter";
export type {
  ResourceKey,
  ChannelStatuses,
  LiveStateSocketKind,
  DebugSub,
  DebugSnapshot,
  LeaderInfo,
  MissedFrame,
} from "./notifications-client";
export {
  resourceDescriptor,
  keyedResourceDescriptor,
  centralResourceDescriptor,
  resourceDescriptorByKey,
  windowResourceDescriptor,
  pointResourceDescriptor,
} from "../core";
export type {
  ResourceDescriptor,
  ResourceOrigin,
  WindowResourceDescriptor,
  PointResourceDescriptor,
  WindowParams,
  PointParams,
  WindowSelector,
} from "../core";
export {
  useWindowResource,
  usePointResource,
  usePointResources,
} from "./window-hooks";

export default {
  description:
    "Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
