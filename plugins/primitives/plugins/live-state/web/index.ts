import type { PluginDefinition } from "@core";

export { NotificationsProvider, useResource, useNotificationsStatus, useNotificationsChannelStatuses } from "./use-resource";
export { NotificationsClient, queryKeyFor } from "./notifications-client";
export type { ResourceKey, ChannelStatuses } from "./notifications-client";
export { resourceDescriptor, centralResourceDescriptor } from "../shared/resource";
export type { ResourceDescriptor, ResourceOrigin } from "../shared/resource";

export default {
  id: "live-state",
  name: "Live State",
  description:
    "Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
