import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationPrepromptsResource as conversationPrepromptsDescriptor } from "../../shared/schemas";
import { conversationPreprompt } from "./tables";

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change-feed routes a preprompt
// insert/update to a tuple iff the changed conversation ids intersect its set —
// so a snapshot write never sweeps the whole table. The extension handle is the
// source, so the projection is its `wireColumns` and the identity is its key
// `conversationId` (the `parent_id` PK); `point.by` IS that identity pk. No
// orderBy — point sets are unordered.
export const conversationPrepromptsResource = windowQueryResource(
  conversationPrepromptsDescriptor,
  {
    from: conversationPreprompt,
    point: { by: conversationPreprompt.table.conversationId },
  },
);
