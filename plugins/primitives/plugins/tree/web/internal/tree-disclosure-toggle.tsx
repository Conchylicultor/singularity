import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";

export interface TreeDisclosureToggleProps {
  isOpen: boolean;
  onToggle?: () => void;
  /** Positioning/reveal classes. The variant owns where the button sits. */
  className?: string;
}

/**
 * The expand/collapse button every tree-row disclosure variant composes.
 *
 * Owns the event plumbing, which is load-bearing and must not be re-derived per
 * variant: the click must not reach the row's `onSelect` (navigation), and the
 * pointer-down must not arm the row's whole-row drag source. A variant supplies
 * only geometry and reveal via `className`.
 */
export function TreeDisclosureToggle({
  isOpen,
  onToggle,
  className,
}: TreeDisclosureToggleProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={isOpen ? "Collapse" : "Expand"}
      // eslint-disable-next-line layout/no-adhoc-layout -- centers the chevron glyph inside the caller-sized toggle box
      className={cn(
        "flex items-center justify-center rounded-md",
        "hover:bg-background/60",
        className,
      )}
    >
      <CollapsibleChevron open={isOpen} className="size-4" />
    </button>
  );
}
