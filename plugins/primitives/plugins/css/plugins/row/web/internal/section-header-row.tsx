import { cn } from "@plugins/primitives/plugins/ui-kit/web";
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
 */
export function SectionHeaderRow({
  open: openProp,
  onClick: onClickProp,
  variant = "eyebrow",
  actions,
  className,
  children,
  ...rest
}: SectionHeaderRowProps) {
  const ctx = useCollapsibleContext();
  const open = openProp ?? ctx?.open ?? false;
  const onClick = onClickProp ?? ctx?.toggle;

  return (
    <Row
      as="button"
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
