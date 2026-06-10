import { MdClose } from "react-icons/md";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { SearchInput, useTextFilter } from "@plugins/primitives/plugins/search/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import type { TaskListItem } from "@plugins/tasks/core";

export function DepPopoverContent({
  label,
  currentConvs,
  orphanIds,
  allTasks,
  candidates,
  busy,
  onAdd,
  onRemove,
}: {
  label: string;
  currentConvs: ConversationRecord[];
  orphanIds: string[];
  allTasks: TaskListItem[];
  candidates: ConversationRecord[];
  busy: string | null;
  onAdd: (conv: ConversationRecord) => void;
  onRemove: (taskId: string) => void;
}) {
  const {
    query: search,
    setQuery: setSearch,
    filtered: availableConvs,
  } = useTextFilter({
    items: candidates,
    accessor: (c) => c.title ?? "",
  });

  return (
    <>
      <SectionLabel className="mb-1.5 text-3xs">{label}</SectionLabel>

      {(currentConvs.length > 0 || orphanIds.length > 0) && (
        <ul className="mb-2 space-y-px">
          {currentConvs.map((c) => (
            <li key={c.taskId} className="flex items-center gap-1">
              <div className="flex-1 overflow-hidden">
                <ConversationItem conv={c} layout="inline" />
              </div>
              <button
                type="button"
                onClick={() => onRemove(c.taskId!)}
                disabled={busy === c.taskId}
                className="hover:bg-destructive/10 hover:text-destructive shrink-0 rounded-md p-0.5"
                aria-label="Remove"
              >
                <MdClose className="size-3" />
              </button>
            </li>
          ))}
          {orphanIds.map((id) => {
            const depTask = allTasks.find((t) => t.id === id);
            const isTerminal =
              depTask?.status === "done" || depTask?.status === "dropped";
            return (
              <li key={id} className="flex items-center gap-1">
                <Text
                  as="span"
                  variant="caption"
                  className={`flex-1 truncate ${isTerminal ? "text-muted-foreground line-through" : ""}`}
                >
                  {depTask?.title ?? id}
                </Text>
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  disabled={busy === id}
                  className="hover:bg-destructive/10 hover:text-destructive shrink-0 rounded-md p-0.5"
                  aria-label="Remove"
                >
                  <MdClose className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <SearchInput
        placeholder="Search conversations…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        wrapperClassName="mb-1.5"
      />
      {availableConvs.length === 0 ? (
        <Text
          as="div"
          variant="caption"
          className="py-2 text-center text-muted-foreground"
        >
          No conversations found
        </Text>
      ) : (
        <ul className="max-h-64 space-y-px overflow-y-auto">
          {availableConvs.map((c) => (
            <li key={c.taskId}>
              <Row
                size="sm"
                onClick={() => onAdd(c)}
                disabled={busy !== null}
              >
                <ConversationItem conv={c} layout="inline" />
              </Row>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
