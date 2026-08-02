import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";
import {
  CollapsibleChevron,
  useCollapsibleContext,
} from "@plugins/primitives/plugins/collapsible/web";
import { Row } from "./row";

export type SectionHeaderVariant = "eyebrow" | "title";

const VARIANT_CLASS: Record<SectionHeaderVariant, string> = {
  eyebrow:
    "text-caption font-medium uppercase tracking-wider text-muted-foreground",
  title: "text-body font-semibold",
};

export interface SectionHeaderRowProps {
  /**
   * Rotates the chevron and feeds aria-expanded. Optional: when omitted, falls
   * back to the surrounding <Collapsible> context.
   */
  open?: boolean;
  /** Click handler. Optional: falls back to the collapsible context's toggle. */
  onClick?: () => void;
  /** Typographic variant. "eyebrow" (default) | "title". */
  variant?: SectionHeaderVariant;
  /** Trailing slot (swatches / stats / headerExtra). */
  actions?: React.ReactNode;
  /**
   * `false` ⇒ a STATIC header row: no chevron, no toggle, no `aria-expanded`,
   * and not a click target at all. For a section that has nothing to expand —
   * its whole content already sits in `actions`. The chevron and the toggle
   * move together on purpose: a row that cannot open must not advertise that
   * it can. The chevron's *width* is still reserved, so titles stay on one
   * column across a stack that mixes both kinds.
   */
  collapsible?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Permissive passthrough. */
  [key: string]: unknown;
}

/**
 * Collapsible section header row. Drop-in for the eyebrow/title
 * <CollapsibleTrigger> pattern: when rendered inside a <Collapsible>, it reads
 * open/toggle/contentId from context (deliberate deviation from the plan's
 * "explicit open" stance — the real usage is the compound <Collapsible> +
 * <CollapsibleContent> pattern, so the header must integrate with context to
 * be a clean drop-in that preserves the aria-controls a11y wiring). Pass
 * explicit `open`/`onClick` for standalone use outside a Collapsible.
 *
 * `collapsible={false}` is the same row WITHOUT the disclosure affordance — the
 * one-line section header, where the row IS the section.
 */
export function SectionHeaderRow({
  open: openProp,
  onClick: onClickProp,
  variant = "eyebrow",
  actions,
  collapsible = true,
  className,
  children,
  ...rest
}: SectionHeaderRowProps) {
  const ctx = useCollapsibleContext();
  const open = openProp ?? ctx?.open ?? false;
  const onClick = onClickProp ?? ctx?.toggle;

  if (!collapsible) {
    // No `onClick` ⇒ `Row` renders a non-interactive <div>, so the `actions`
    // stay the row's only click targets and there is no dead affordance.
    return (
      <Row
        // The chevron's BOX is kept, only its ink is dropped: a stack mixing
        // collapsible and static headers has to align on one title column, or
        // the static ones read as a different kind of card rather than the same
        // card without a body. Rendering the real `CollapsibleChevron` under
        // `invisible` (which also takes it out of the a11y tree) means the
        // spacer IS the thing it reserves space for — it cannot drift from the
        // chevron's size the way a hand-measured spacer box would.
        icon={<CollapsibleChevron className="invisible" />}
        actionsAlwaysVisible
        actions={actions}
        className={cn(VARIANT_CLASS[variant], className)}
        {...rest}
      >
        {children}
      </Row>
    );
  }

  return (
    <Row
      aria-expanded={open}
      aria-controls={ctx?.contentId}
      onClick={onClick}
      actionsAlwaysVisible
      hover="muted"
      actions={actions}
      icon={<CollapsibleChevron open={open} />}
      className={cn(VARIANT_CLASS[variant], className)}
      {...rest}
    >
      {children}
    </Row>
  );
}
