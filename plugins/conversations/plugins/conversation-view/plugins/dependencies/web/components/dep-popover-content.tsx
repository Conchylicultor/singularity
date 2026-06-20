import { MdClose } from "react-icons/md";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
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
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- bottom offset on the section label; siblings sit in a fragment with no flex parent to own the gap */}
      <SectionLabel className="mb-1.5 text-3xs">{label}</SectionLabel>

      {(currentConvs.length > 0 || orphanIds.length > 0) && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- bottom offset separating the current-deps list from the search input; fragment parent can't own the gap
        <ul className="mb-2 space-y-px">
          {currentConvs.map((c) => (
            <li key={c.taskId}>
              <Frame
                gap="xs"
                align="center"
                content={<ConversationItem conv={c} layout="inline" />}
                trailing={
                  <button
                    type="button"
                    onClick={() => onRemove(c.taskId!)}
                    disabled={busy === c.taskId}
                    className="hover:bg-destructive/10 hover:text-destructive rounded-md p-2xs"
                    aria-label="Remove"
                  >
                    <MdClose className="size-3" />
                  </button>
                }
              />
            </li>
          ))}
          {orphanIds.map((id) => {
            const depTask = allTasks.find((t) => t.id === id);
            const isTerminal =
              depTask?.status === "done" || depTask?.status === "dropped";
            return (
              <li key={id}>
                <Frame
                  gap="xs"
                  align="center"
                  content={
                    <Text
                      className={`text-caption ${isTerminal ? "text-muted-foreground line-through" : ""}`}
                    >
                      {depTask?.title ?? id}
                    </Text>
                  }
                  trailing={
                    <button
                      type="button"
                      onClick={() => onRemove(id)}
                      disabled={busy === id}
                      className="hover:bg-destructive/10 hover:text-destructive rounded-md p-2xs"
                      aria-label="Remove"
                    >
                      <MdClose className="size-3" />
                    </button>
                  }
                />
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
          className="py-sm text-center text-muted-foreground"
        >
          No conversations found
        </Text>
      ) : (
        <Scroll as="ul" className="max-h-64 space-y-px">
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
        </Scroll>
      )}
    </>
  );
}
