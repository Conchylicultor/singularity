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
  /** Optional per-app attention overlay (e.g. a sync-error dot), pinned to the
   *  tab icon's top-right corner — mirrors the app-rail icon badge. The badge
   *  component renders `null` when there's nothing to surface. It rides the icon
   *  (not the label) so it survives the collapsed / icon-only overflow state. */
  badge?: ComponentType<{ className?: string }>;
  /** Merged onto the variant root (e.g. a consumer's drag-state opacity). */
  className?: string;
  /** Passthrough for drag handlers + data-* attrs the consumer puts on the root. */
  [key: string]: unknown;
}
