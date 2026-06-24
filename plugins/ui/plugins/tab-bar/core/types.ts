import type { ComponentType } from "react";

export interface TabProps {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  /** Icon-only (overflow collapse). Variants hide the label + close when true. */
  collapsed?: boolean;
  onActivate?: () => void;
  /** When provided, the variant renders a trailing close button (TabCloseButton). */
  onClose?: () => void;
  /** Merged onto the variant root (e.g. a consumer's drag-state opacity). */
  className?: string;
  /** Passthrough for drag handlers + data-* attrs the consumer puts on the root. */
  [key: string]: unknown;
}
