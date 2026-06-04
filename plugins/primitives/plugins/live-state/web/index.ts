import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { NotificationsProvider, useResource, useSuspenseResource, useNotificationsStatus, useNotificationsChannelStatuses } from "./use-resource";
export type { ResourceResult } from "./use-resource";
export { NotificationsClient, queryKeyFor } from "./notifications-client";
export type { ResourceKey, ChannelStatuses } from "./notifications-client";
export { resourceDescriptor, centralResourceDescriptor } from "../core/resource";
export type { ResourceDescriptor, ResourceOrigin } from "../core/resource";

export default {
  name: "Live State",
  description:
    "Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
