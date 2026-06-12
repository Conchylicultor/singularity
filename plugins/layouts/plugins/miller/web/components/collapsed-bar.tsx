import { MdChevronRight } from "react-icons/md";
import type { MatchEntry } from "@plugins/primitives/plugins/pane/web";

interface CollapsedBarProps {
  entry: MatchEntry;
  onExpand: () => void;
}

export function CollapsedBar({ entry, onExpand }: CollapsedBarProps) {
  const title = resolveTitle(entry);
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${title ?? entry.pane.id}`}
      className="flex h-full w-8 shrink-0 flex-col items-center gap-sm border-r bg-muted/40 py-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <MdChevronRight className="size-4" />
      {title && (
        <span
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          className="truncate text-2xs font-medium"
        >
          {title}
        </span>
      )}
    </button>
  );
}

function resolveTitle(entry: MatchEntry): string | null {
  const t = entry.pane.chrome.title;
  if (typeof t === "string") return t;
  if (typeof t === "function") return t(entry.fullParams);
  return entry.pane.id;
}
