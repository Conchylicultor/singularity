import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdArticle } from "react-icons/md";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { gitStatusDot } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";

/**
 * Fixed height of one doc row, in rem. Single source of truth shared with the
 * docs pane, which caps the list to a multiple of this so "show N rows, then
 * scroll" stays exact without a hand-tuned pixel max-height.
 */
export const DOC_ROW_HEIGHT_REM = 1.5;

export function DocRow({
  path,
  status,
  selected,
  onSelect,
}: {
  path: string;
  status: EditedFileStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? path.slice(slash + 1) : path;
  const muted = status === "deleted";

  return (
    <button
      type="button"
      disabled={muted}
      onClick={onSelect}
      aria-pressed={selected}
      style={{ height: `${DOC_ROW_HEIGHT_REM}rem` }}
      className={cn(
        "flex w-full items-center gap-xs px-sm text-left text-caption hover:bg-muted/60 disabled:cursor-not-allowed",
        muted && "opacity-60",
        selected && "bg-muted",
      )}
      title={`${status} — ${path}`}
    >
      <StatusDot colorClass={gitStatusDot(status)} />
      <MdArticle className="size-3 shrink-0 text-muted-foreground" />
      <Text className="truncate text-muted-foreground">{dir}</Text>
      <Text className={cn("truncate", !muted && "font-medium")}>{basename}</Text>
    </button>
  );
}
