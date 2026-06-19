import { MdChevronRight } from "react-icons/md";
import type { MatchEntry } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

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
      // The collapsed rail is a rigid column in the externally-owned miller
      // flex row; `shrink-0` keeps it from being crushed.
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid leaf of miller's not-yet-drained column flex
      className="h-full w-8 shrink-0 border-r bg-muted/40 py-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Stack align="center" gap="sm">
        <MdChevronRight className="size-4" />
        {title && (
          <span
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            className="truncate text-2xs font-medium"
          >
            {title}
          </span>
        )}
      </Stack>
    </button>
  );
}

function resolveTitle(entry: MatchEntry): string | null {
  const t = entry.pane.chrome.title;
  if (typeof t === "string") return t;
  if (typeof t === "function") return t(entry.fullParams);
  return entry.pane.id;
}
