import { X } from "lucide-react";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { SearchInput, useTextFilter } from "@plugins/primitives/plugins/search/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import type { Task } from "@plugins/tasks/core";

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
  allTasks: Task[];
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
      <SectionLabel className="mb-1.5 text-[10px]">{label}</SectionLabel>

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
                className="hover:bg-destructive/10 hover:text-destructive shrink-0 rounded p-0.5"
                aria-label="Remove"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
          {orphanIds.map((id) => {
            const depTask = allTasks.find((t) => t.id === id);
            const isTerminal =
              depTask?.status === "done" || depTask?.status === "dropped";
            return (
              <li key={id} className="flex items-center gap-1">
                <span
                  className={`flex-1 truncate text-xs ${isTerminal ? "text-muted-foreground line-through" : ""}`}
                >
                  {depTask?.title ?? id}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  disabled={busy === id}
                  className="hover:bg-destructive/10 hover:text-destructive shrink-0 rounded p-0.5"
                  aria-label="Remove"
                >
                  <X className="size-3" />
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
        <div className="py-2 text-center text-xs text-muted-foreground">
          No conversations found
        </div>
      ) : (
        <ul className="max-h-64 space-y-px overflow-y-auto">
          {availableConvs.map((c) => (
            <li key={c.taskId}>
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left hover:bg-accent disabled:opacity-50"
                onClick={() => onAdd(c)}
                disabled={busy !== null}
              >
                <ConversationItem conv={c} layout="inline" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
