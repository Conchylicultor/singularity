import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationPrepromptsResource as conversationPrepromptsDescriptor } from "../../shared/schemas";
import { conversationPreprompt } from "./tables";

const t = conversationPreprompt.table;

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change-feed routes a preprompt
// insert/update to a tuple iff the changed conversation ids intersect its set —
// so a snapshot write never sweeps the whole table. The PK column `parent_id`
// is projected under the ALIAS `conversationId` (the point identity); `point.by`
// IS that identity pk. The body column is physically `prompt_text` (aliased to
// the wire field `text`), and `icon` (an AvatarSpec jsonb) projects as a plain
// column. No orderBy — point sets are unordered.
export const conversationPrepromptsResource = windowQueryResource(conversationPrepromptsDescriptor, {
  from: t,
  select: {
    conversationId: t.parentId,
    prepromptId: t.prepromptId,
    title: t.title,
    text: t.text,
    icon: t.icon,
    updatedAt: t.updatedAt,
  },
  point: { by: t.parentId },
});
