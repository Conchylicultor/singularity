import type { ReactNode } from "react";

/**
 * The leading slot of an icon-bearing tree row: the row's identity icon plus
 * its expand/collapse affordance. A disclosure variant owns how the two are
 * arranged — merged into one box (Notion style), merged with childless rows
 * dimmed, or split into a dedicated chevron column (Finder / VS Code style).
 *
 * Owned by `tree` (the consumer) so the contract lives with the slot, and a UI
 * variant plugin can contribute without `tree` ever importing `plugins/ui/*` —
 * which it structurally cannot, since `ui/variant-region` reaches `config_v2`,
 * and `config_v2` reaches back into `tree` via the data-view tree.
 */
export interface TreeDisclosureProps {
  /** The row's identity icon. Non-null — icon-less rows never reach the slot. */
  icon: ReactNode;
  /** Whether this row actually has children right now. */
  hasChildren: boolean;
  /** Whether the row is currently expanded. */
  isOpen: boolean;
  /**
   * `hasChildren || leafChevron` — whether a chevron may be offered at all.
   * An editable tree keeps the chevron on childless rows (a leaf can gain
   * children by drop); a read-only tree does not.
   */
  expandable: boolean;
  /** Toggle expand/collapse. Undefined on rows that cannot toggle. */
  onToggle?: () => void;
}
