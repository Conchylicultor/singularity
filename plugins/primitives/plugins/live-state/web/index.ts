import type { PluginDefinition } from "@core";

export { NotificationsProvider, useResource } from "./use-resource";
export { NotificationsClient, queryKeyFor } from "./notifications-client";
export type { ResourceKey } from "./notifications-client";
export { resourceDescriptor } from "../shared/resource";
export type { ResourceDescriptor } from "../shared/resource";

export default {
  id: "live-state",
  name: "Live State",
  description:
    "Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
