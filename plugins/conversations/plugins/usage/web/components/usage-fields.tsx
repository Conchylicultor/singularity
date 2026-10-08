import type { ReactElement } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { ConversationListLiveRow } from "@plugins/conversations/plugins/all-conversations/core";
import {
  formatTokensCompact,
  formatUsd,
} from "@plugins/stats/plugins/cost/core";
import {
  allConversationsUsage,
  conversationHistoryUsage,
} from "../../shared/columns";

type UsageHandle = typeof allConversationsUsage;

/**
 * The Cost / Tokens / Agents fields of one conversation list, read off its rows'
 * `usage` columns and bound to them, so the list sorts and filters by them on
 * the server. A conversation not counted yet reads 0 (the extension's default).
 */
function usageFields(handle: UsageHandle): FieldDef<ConversationListLiveRow>[] {
  return [
    {
      id: "costUsd",
      label: "Cost",
      type: "number",
      width: "6rem",
      align: "end",
      value: (c) => handle.read(c).costUsd,
      cell: (c) => formatUsd(handle.read(c).costUsd),
      sortable: true,
      column: handle.column("costUsd"),
    },
    {
      id: "tokens",
      label: "Tokens",
      type: "int",
      width: "6rem",
      align: "end",
      value: (c) => handle.read(c).tokens,
      cell: (c) => formatTokensCompact(handle.read(c).tokens),
      sortable: true,
      column: handle.column("tokens"),
    },
    {
      id: "agentCount",
      label: "Agents",
      type: "int",
      width: "5rem",
      align: "end",
      value: (c) => handle.read(c).agentCount,
      sortable: true,
      column: handle.column("agentCount"),
    },
  ];
}

const ALL_CONVERSATIONS_FIELDS = usageFields(allConversationsUsage);
const HISTORY_FIELDS = usageFields(conversationHistoryUsage);

/** Field extension contributed into the All-conversations list. */
export function AllConversationsUsageFields({
  render,
}: FieldExtensionProps<ConversationListLiveRow>): ReactElement {
  return <>{render(ALL_CONVERSATIONS_FIELDS)}</>;
}

/** Field extension contributed into the sidebar History list. */
export function HistoryUsageFields({
  render,
}: FieldExtensionProps<ConversationListLiveRow>): ReactElement {
  return <>{render(HISTORY_FIELDS)}</>;
}
