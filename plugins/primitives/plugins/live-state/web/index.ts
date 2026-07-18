import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { NotificationsProvider, ensureNotificationsClient, useResource, hydrateResource, hydrateQuery, useNotificationsStatus, useNotificationsChannelStatuses, useNotificationsClient, getNotificationsClient } from "./use-resource";
export { hydrateEndpoint } from "./hydrate-endpoint";
export { registerSlowResourceReporter } from "./slow-resource-reporter";
export type { SlowResourceInfo } from "./slow-resource-reporter";
export type { ResourceResult } from "./use-resource";
export { combineResources, useCombinedResources } from "./resource-utils";
export type { GateInput, GateDataOf, CombinedResources } from "./resource-utils";
export { matchResource, ResourceView } from "./components/resource-view";
export type { MatchResourceHandlers, ResourceViewProps } from "./components/resource-view";
export { NotificationsClient, queryKeyFor, liveStateSocketKind, ResourceStaleReadError } from "./notifications-client";
export { noteResourceWatermark, getResourceWatermark } from "./watermark-registry";
export { httpStaleDropReportSink } from "./stale-drop-reporter";
export type { HttpStaleDropReport } from "./stale-drop-reporter";
export type { ResourceKey, ChannelStatuses, LiveStateSocketKind, DebugSub, DebugSnapshot, LeaderInfo, MissedFrame } from "./notifications-client";
export { resourceDescriptor, keyedResourceDescriptor, centralResourceDescriptor, resourceDescriptorByKey } from "../core/resource";
export type { ResourceDescriptor, ResourceOrigin } from "../core/resource";
export { windowResourceDescriptor, pointResourceDescriptor } from "../core/window";
export type { WindowResourceDescriptor, PointResourceDescriptor, WindowParams, PointParams, WindowSelector } from "../core/window";
export { useWindowResource, usePointResource, usePointResources } from "./window-hooks";

export default {
  description:
    "Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
