import { MdArticle } from "react-icons/md";
import { cn } from "@/lib/utils";
import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/shared";

const STATUS_DOT: Record<EditedFileStatus, string> = {
  modified: "bg-blue-500",
  added: "bg-emerald-500",
  untracked: "bg-amber-500",
  deleted: "bg-muted-foreground/40",
};

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
        "flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-xs hover:bg-muted/60 disabled:cursor-not-allowed",
        muted && "opacity-60",
        selected && "bg-muted",
      )}
      title={`${status} — ${path}`}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          STATUS_DOT[status],
        )}
      />
      <MdArticle className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate text-muted-foreground">{dir}</span>
      <span className={cn("truncate", !muted && "font-medium")}>{basename}</span>
    </button>
  );
}
