import type { ReactElement, ReactNode } from "react";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ConvStatusDot } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { FieldDef, FieldValue } from "@plugins/primitives/plugins/data-view/web";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { CONVERSATION_FIELDS } from "../../core";

// Comparable projection for one field id. Drives the toolbar sort/filter pills and
// the default table/list cell. (Search/filter/sort run server-side here; this only
// powers the chrome and read cells.)
function fieldValue(c: Conversation, id: string): FieldValue {
  switch (id) {
    case "title":
      return c.title;
    case "status":
      return c.status;
    case "model":
      return c.model;
    case "kind":
      return c.kind;
    case "runtime":
      return c.runtime;
    case "createdAt":
      return c.createdAt;
    case "endedAt":
      return c.endedAt;
    case "worktreePath":
      return c.worktreePath;
    default:
      return null;
  }
}

function StatusCell({ conv }: { conv: Conversation }): ReactElement {
  return (
    <Inline gap="xs">
      <ConvStatusDot conv={conv} />
      <Text as="span" variant="caption">
        {conv.status}
      </Text>
    </Inline>
  );
}

function cellFor(id: string, type: string): ((c: Conversation) => ReactNode) | undefined {
  if (type === "date") {
    return (c: Conversation) => {
      const v = fieldValue(c, id);
      return v instanceof Date ? <RelativeTime date={v} /> : null;
    };
  }
  if (id === "status") return (c: Conversation) => <StatusCell conv={c} />;
  return undefined;
}

// The web `FieldDef[]`, derived from the shared CONVERSATION_FIELDS vocabulary so
// it can never drift from the server's FieldColumnMap.
export const conversationFieldDefs: FieldDef<Conversation>[] = CONVERSATION_FIELDS.map((spec) => ({
  id: spec.id,
  label: spec.label,
  type: spec.type,
  primary: spec.primary,
  sortable: spec.sortable,
  options: spec.options,
  value: (c: Conversation) => fieldValue(c, spec.id),
  cell: cellFor(spec.id, spec.type),
}));
