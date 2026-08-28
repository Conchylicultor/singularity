import { MdChevronRight } from "react-icons/md";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { BreadcrumbSlots } from "../slots";

/**
 * The default mark between two crumbs: a chevron, dimmed, with the trail's own
 * gap as its air on both sides.
 *
 * Used when no `Breadcrumb.Separator` is contributed, so a trail looks the same
 * whether or not the separator variant plugin is loaded. The `chevron` variant
 * mirrors it byte-for-byte, exactly as tree's default merged disclosure and its
 * `merged` variant do.
 */
function DefaultChevronSeparator() {
  return (
    <MdChevronRight
      aria-hidden
      className={cn(rigidClass(), "text-muted-foreground/45")}
    />
  );
}

/**
 * One gap in the trail. Renders the contributed separator — whose own variant
 * region picks chevron or slash from the theme — or the inline default.
 */
export function TrailSeparator() {
  const contributions = BreadcrumbSlots.Separator.useContributions();
  const separator = contributions[0];
  if (!separator) return <DefaultChevronSeparator />;
  // `useContributions()` seals the `component` field, so the separator can't be
  // rendered as `<Separator/>`; route it through renderIsolated (which unseals
  // and applies the error-boundary middleware) — same as tree's disclosure.
  return renderIsolated(
    BreadcrumbSlots.Separator,
    separator as unknown as Contribution,
    {},
  );
}
