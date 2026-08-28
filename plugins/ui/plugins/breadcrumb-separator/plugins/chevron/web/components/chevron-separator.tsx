import { MdChevronRight } from "react-icons/md";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Chevron separator — a dimmed caret between crumbs, sized in em with the
 * trail's own text and carrying the trail's gap as air on both sides.
 *
 * It says "descend into" rather than "and then": the mark points along the
 * direction the path is read, which is why it is the default. Mirrors
 * breadcrumb's inline default byte-for-byte, so loading this plugin changes
 * nothing until the slash is picked.
 */
export function ChevronSeparator() {
  return (
    <MdChevronRight
      aria-hidden
      className={cn(rigidClass(), "text-muted-foreground/45")}
    />
  );
}
