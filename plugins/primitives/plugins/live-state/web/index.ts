import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { NotificationsProvider, useResource, hydrateResource, hydrateQuery, useNotificationsStatus, useNotificationsChannelStatuses, useNotificationsClient, getNotificationsClient } from "./use-resource";
export { hydrateEndpoint } from "./hydrate-endpoint";
export { registerSlowResourceReporter } from "./slow-resource-reporter";
export type { SlowResourceInfo } from "./slow-resource-reporter";
export type { ResourceResult } from "./use-resource";
export { combineResources, useCombinedResources } from "./resource-utils";
export type { GateInput, GateDataOf, CombinedResources } from "./resource-utils";
export { matchResource, ResourceView } from "./components/resource-view";
export type { MatchResourceHandlers, ResourceViewProps } from "./components/resource-view";
export { NotificationsClient, queryKeyFor, liveStateSocketKind } from "./notifications-client";
export type { ResourceKey, ChannelStatuses, LiveStateSocketKind, DebugSub, DebugSnapshot, LeaderInfo, MissedFrame } from "./notifications-client";
export { resourceDescriptor, keyedResourceDescriptor, centralResourceDescriptor } from "../core/resource";
export type { ResourceDescriptor, ResourceOrigin } from "../core/resource";

export default {
  description:
    "Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
