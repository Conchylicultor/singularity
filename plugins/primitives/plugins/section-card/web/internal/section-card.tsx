import type { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import {
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface SectionCardProps {
  /** The card's identity, and its click target: clicking it toggles the body. */
  title: string;
  /**
   * Leading icon, rendered between the chevron and the title. Pass the raw icon
   * element — the header row owns its size (`icon-auto`) and color.
   */
  icon?: ReactNode;
  /**
   * Header-right controls, laid out as a SIBLING of the title button (never a
   * nested interactive), so they keep their own click and stay reachable while
   * the card is collapsed. Rendered at `sm` control density — a header affordance
   * is chrome, not body content.
   */
  actions?: ReactNode;
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled initial state. Default: collapsed. */
  defaultOpen?: boolean;
  className?: string;
  /** The collapsible body. Unmounted while collapsed. */
  children: ReactNode;
}

/**
 * A titled, collapsible card: `Card` chrome around a `SectionHeaderRow` trigger
 * and a `CollapsibleContent` body. Collapsed, it is exactly one row — chevron,
 * icon, title, and whatever header actions the caller keeps reachable.
 *
 * This is the sanctioned home for the "card whose title expands it" shape. It
 * exists so a stack of such cards is uniform BY CONSTRUCTION: the caller supplies
 * a title and a body, never the chrome, so no two cards can drift on padding,
 * radius, title typography, or chevron placement.
 *
 * The body is genuinely unmounted while collapsed (`CollapsibleContent`), so a
 * heavy panel costs nothing until opened. Anything that must keep running while
 * the card is shut (persistence, subscriptions) does not belong in the body —
 * lift it into a headless always-mounted component.
 */
export function SectionCard({
  title,
  icon,
  actions,
  open,
  onOpenChange,
  defaultOpen,
  className,
  children,
}: SectionCardProps) {
  return (
    <Card className={cn("rounded-lg p-none", className)}>
      <Collapsible open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
        {/* The row reads `open` / `toggle` / `contentId` off the Collapsible
            context, so the chevron, the aria wiring, and the actions-as-sibling
            split (no nested <button>) all come for free. */}
        <SectionHeaderRow
          variant="title"
          className="rounded-lg px-lg py-md"
          actions={
            actions ? (
              <ControlSizeProvider size="sm">{actions}</ControlSizeProvider>
            ) : undefined
          }
        >
          {icon}
          {title}
        </SectionHeaderRow>
        <CollapsibleContent className="px-lg pb-lg">{children}</CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
