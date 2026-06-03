import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { activeDataBindingsResource } from "./internal/resource";
import { handleDeleteBinding, handlePutBinding } from "./internal/routes";
import { putBinding, deleteBinding } from "../core/endpoints";

export { _activeDataBindings } from "./internal/tables";
export { activeDataBindingsResource } from "./internal/resource";

export default {
  name: "Active Data",
  description:
    "Persistent state for inline interactive widgets — table + resource keyed by (conversationId, messageId, tag, occurrenceIndex).",
  contributions: [Resource.Declare(activeDataBindingsResource)],
  httpRoutes: {
    [putBinding.route]: handlePutBinding,
    [deleteBinding.route]: handleDeleteBinding,
  },
} satisfies ServerPluginDefinition;
