import { MdChevronRight } from "react-icons/md";
import {
  paneThemeScope,
  type MatchEntry,
} from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Theme } from "@plugins/primitives/plugins/css/plugins/theme-boundary/web";

interface CollapsedBarProps {
  entry: MatchEntry;
  onExpand: () => void;
}

export function CollapsedBar({ entry, onExpand }: CollapsedBarProps) {
  const title = resolveTitle(entry);
  return (
    // A collapsed column is still this pane, so it wears the pane's own theme
    // (its home app's) exactly like the expanded body does — otherwise
    // collapsing a guest pane would snap its rail back to the host's palette.
    //
    // `sunken` is the recessed-well role this rail already meant. It paints an
    // OPAQUE `bg-muted`, where the rail used to paint `bg-muted/40`: a
    // translucent tint inside a theme boundary composites over whatever is
    // behind it, which is the HOST's canvas, so a collapsed guest pane's rail
    // blended its own muted over the host's background and landed on neither
    // theme. Going opaque is the deliberate visual change that fixes it.
    <Theme
      as="button"
      name={paneThemeScope(entry.pane)}
      surface="sunken"
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${title ?? entry.pane.id}`}
      // The collapsed rail is a rigid column in the externally-owned miller
      // flex row; `shrink-0` keeps it from being crushed.
      //
      // `hover:bg-hover-fill` rather than the old `hover:bg-muted`, which is now
      // the base tone itself and would read as a dead control. `--hover-fill` is
      // the step off the background that the `sunken` bundle publishes for
      // exactly this — a small foreground tint over `--muted`, so it darkens
      // under light and lightens under dark at any preset, and it follows the
      // pane's own theme rather than being re-picked here.
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid leaf of miller's not-yet-drained column flex
      className="h-full w-8 shrink-0 border-r py-sm text-muted-foreground hover:bg-hover-fill hover:text-foreground"
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
    </Theme>
  );
}

function resolveTitle(entry: MatchEntry): string | null {
  const t = entry.pane.chrome.title;
  if (typeof t === "string") return t;
  if (typeof t === "function") return t(entry.fullParams);
  return entry.pane.id;
}
