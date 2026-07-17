import type { ReactNode } from "react";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  createConversationGroup,
  patchConversationGroup,
} from "@plugins/conversations/plugins/conversations-view/plugins/grouped/core";
import type { GroupedRow } from "./use-grouped-rows";

/**
 * Rename a group row. Only `group` / `auto-group` rows reach this — the `canEdit`
 * gate below withdraws the capability everywhere else, so there is no path where
 * a write is accepted and discarded.
 *
 * Renaming an **auto-group** promotes it: the derived cluster becomes a real,
 * persistent group carrying the typed title (classic's own semantics).
 */
async function renameRow(row: GroupedRow, next: string): Promise<void> {
  const title = next.trim();
  if (!title) return; // an empty label is not a rename — keep the current title
  if (row.kind === "group") {
    await fetchEndpoint(patchConversationGroup, { id: row.id }, { body: { title } });
    return;
  }
  if (row.kind === "auto-group") {
    await fetchEndpoint(
      createConversationGroup,
      {},
      { body: { title, conversationIds: row.rootConvIds } },
    );
  }
}

/** The read-rendering of a row's primary label. */
function labelCell(row: GroupedRow): ReactNode {
  if (row.kind === "conv" || row.kind === "fork") {
    // The single-line layout: the tree row is a line container, so the block
    // layout's second (meta) line would be collapsed by the label's truncation.
    return <ConversationItem conv={row.conv} layout="inline" />;
  }
  if (row.kind === "bucket") {
    return (
      <Text as="span" variant="eyebrow" tone="muted">
        {row.title}
      </Text>
    );
  }
  return (
    <Text as="span" variant="label">
      {row.title}
    </Text>
  );
}

/**
 * The Grouped DataView field schema. Deliberately NOT `conversationFieldDefs`
 * (the Queue's reuse): those project a `Conversation`, and a `GroupedRow` is a
 * union whose group/auto-group/bucket members have no conversation at all.
 *
 * - `title` is the primary field → the tree row label, click-to-edit on the two
 *   renameable kinds via `canEdit` (conversations have no rename endpoint).
 * - `kind` is a **filter-only** dimension (the committed config authors
 *   `visibleFields: ["title"]`, so it never renders as a trailing chip): the
 *   filter pill's `kind is-none-of [system]` IS classic's show/hide-system eye
 *   toggle. Group/bucket rows project `null`, which `is-none-of` admits — so a
 *   group never disappears because it holds no matching conversation.
 */
export const groupedFields: FieldDef<GroupedRow>[] = [
  {
    id: "title",
    label: "Title",
    type: "text",
    primary: true,
    value: (r) => r.title,
    cell: labelCell,
    onEdit: (r, next) => renameRow(r, String(next ?? "")),
    canEdit: (r) => r.kind === "group" || r.kind === "auto-group",
  },
  {
    id: "kind",
    label: "Kind",
    type: "enum",
    value: (r) => (r.kind === "conv" || r.kind === "fork" ? r.conv.kind : null),
    groupable: false,
    options: [
      { value: "user", label: "User" },
      { value: "agent", label: "Agent" },
      { value: "system", label: "System" },
    ],
  },
];
