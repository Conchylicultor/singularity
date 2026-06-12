import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { MdArticle } from "react-icons/md";
import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { gitStatusDot } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";

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
      className={cn(
        "flex w-full items-center gap-xs px-sm py-2xs text-left text-caption hover:bg-muted/60 disabled:cursor-not-allowed",
        muted && "opacity-60",
        selected && "bg-muted",
      )}
      title={`${status} — ${path}`}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          gitStatusDot(status),
        )}
      />
      <MdArticle className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate text-muted-foreground">{dir}</span>
      <span className={cn("truncate", !muted && "font-medium")}>{basename}</span>
    </button>
  );
}
