import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { activeDataBindingsResource } from "./internal/resource";
import { handleDeleteBinding, handlePutBinding } from "./internal/routes";

export { _activeDataBindings } from "./internal/tables";
export { activeDataBindingsResource } from "./internal/resource";

export default {
  id: "active-data",
  name: "Active Data",
  description:
    "Persistent state for inline interactive widgets — table + resource keyed by (conversationId, messageId, tag, occurrenceIndex).",
  contributions: [Resource.Declare(activeDataBindingsResource)],
  httpRoutes: {
    "PUT /api/active-data/bindings/:conversationId/:messageId/:tag/:occurrenceIndex":
      handlePutBinding,
    "DELETE /api/active-data/bindings/:conversationId/:messageId/:tag/:occurrenceIndex":
      handleDeleteBinding,
  },
} satisfies ServerPluginDefinition;
