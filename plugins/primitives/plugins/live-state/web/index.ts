import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { NotificationsProvider, useResource, hydrateResource, useNotificationsStatus, useNotificationsChannelStatuses, useNotificationsClient, getNotificationsClient } from "./use-resource";
export type { ResourceResult } from "./use-resource";
export { combineResources, useCombinedResources } from "./resource-utils";
export type { GateInput, GateDataOf, CombinedResources } from "./resource-utils";
export { matchResource, ResourceView } from "./components/resource-view";
export type { MatchResourceHandlers, ResourceViewProps } from "./components/resource-view";
export { NotificationsClient, queryKeyFor } from "./notifications-client";
export type { ResourceKey, ChannelStatuses, DebugSub, DebugSnapshot, LeaderInfo, ResyncSub } from "./notifications-client";
export { resourceDescriptor, keyedResourceDescriptor, centralResourceDescriptor } from "../core/resource";
export type { ResourceDescriptor, ResourceOrigin } from "../core/resource";

export default {
  description:
    "Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
