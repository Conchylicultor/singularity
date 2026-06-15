import { MdChevronRight } from "react-icons/md";
import { useSidebar, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";

/**
 * Slim reopen affordance shown only while the sidebar is collapsed (offcanvas,
 * which hides the in-header {@link SidebarTrigger}). Pinned to the left edge of
 * the main area and vertically centered, so — unlike a top-left floating button
 * — it never overlaps a pane's title. Rendered inside the SidebarInset, so it
 * sits just right of the collapsed sidebar's edge. Cmd/Ctrl+B still toggles too.
 */
export function SidebarReopenHandle() {
  const { state, toggleSidebar } = useSidebar();
  if (state !== "collapsed") return null;
  return (
    <WithTooltip content="Open sidebar" side="right">
      <button
        type="button"
        aria-label="Open sidebar"
        onClick={toggleSidebar}
        className={cn(
          "absolute top-1/2 left-0 z-float flex h-12 w-3 -translate-y-1/2 items-center justify-center",
          "rounded-r-md border border-l-0 border-border/60 bg-background/80 text-muted-foreground backdrop-blur",
          "opacity-60 transition-[opacity,width] hover:w-5 hover:opacity-100",
        )}
      >
        <MdChevronRight className="size-4" />
      </button>
    </WithTooltip>
  );
}
