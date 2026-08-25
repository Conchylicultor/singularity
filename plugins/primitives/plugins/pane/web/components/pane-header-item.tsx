import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentType, ReactNode } from "react";

type HeaderIcon = ComponentType<{ className?: string }>;

/**
 * What every header item carries, whichever renderable form it takes.
 *
 * `id` is REQUIRED and must be stable for the contribution's whole life: the
 * header renders inside an [`AdaptiveBar`](../../../adaptive-bar/CLAUDE.md),
 * whose width ledger and DOM move plan are both keyed on it. An id that churns
 * per render throws every measurement away each frame; a duplicate id makes
 * "which node is this" — and therefore "where does it go" — unanswerable.
 */
interface PaneHeaderItemBase {
  /** Short kebab-case, describing the action ("improve", "view-mode"). */
  id: string;
  /**
   * Which KIND of cell the header gives this item. Omitted (the common case) is
   * an ordinary occupant: rigid, measured, and relocated behind the `⋯` when the
   * row runs out of room.
   *
   * `"yield"` is the row's give — the pane title's shape, and the reason the
   * title is not a special case of the header but an item like any other. It is
   * excluded from the bar's fit ledger (never measured, demoted or relocated),
   * `min-w-0` so its text ellipsizes instead of pushing the actions out of the
   * row, and it takes the row's leftover so the ordinary occupants stay packed
   * against the trailing edge.
   *
   * At most ONE per header: two would split the leftover between themselves and
   * both ellipsize, with the loser decided by their content rather than by the
   * author. Enforced by the primitive that owns the rule — `AdaptiveBar.Yield`
   * throws when a second one mounts in the same bar.
   */
  cell?: "yield";
}

/**
 * An action item — a ghost button. Requires an `onClick` *and* at least one of
 * `label`/`icon`, so an action is never an invisible empty button. `component`
 * is forbidden: an item is an action xor a custom widget, never both.
 */
export type PaneHeaderAction = PaneHeaderItemBase & {
  onClick: () => void;
  component?: never;
} & (
    { label: string; icon?: HeaderIcon } | { icon: HeaderIcon; label?: string }
  );

/**
 * A custom-rendered widget: a self-contained zero-prop component that reads its
 * own data from app context. The action fields are forbidden so it cannot
 * masquerade as a half-specified button.
 */
export type PaneHeaderComponent = PaneHeaderItemBase & {
  component: ComponentType;
  onClick?: never;
  label?: never;
  icon?: never;
};

/**
 * One entry in a pane header — the SINGLE contribution type for the whole
 * header row, title included.
 *
 * The union carries exactly one renderable form, so an item with neither
 * `component` nor `onClick` (the silent "renders nothing" footgun) is
 * unconstructable rather than merely discouraged.
 *
 * This type lives in `pane` because `PaneChrome` is the host that renders it,
 * and every header slot — a pane's own auto-minted one and a shared
 * `definePaneHeaderSlot()` — is a `RenderSlot` of it.
 */
export type PaneHeaderItem = PaneHeaderAction | PaneHeaderComponent;

/**
 * Renders one {@link PaneHeaderItem}: a self-contained `component`, or a ghost
 * button built from `label`/`icon`/`onClick`. The one cell renderer for every
 * pane header — what the item IS is decided here, where it is painted, and how
 * much room it gets is decided by `cell` at the bar.
 */
export function PaneHeaderCell(item: PaneHeaderItem): ReactNode {
  if (item.component) {
    const Comp = item.component;
    return <Comp />;
  }
  if (item.onClick) {
    return (
      <Button variant="ghost" onClick={item.onClick}>
        {item.icon && <item.icon className="size-4" />}
        {item.label}
      </Button>
    );
  }
  // Unreachable by construction — the union admits no item with neither
  // `component` nor `onClick`. Fail loudly if one is forced in through an
  // untyped / `as any` contribution, instead of silently rendering nothing.
  throw new Error(
    "PaneHeaderItem has neither `component` nor `onClick`: a pane-header " +
      "contribution must carry exactly one renderable form (an `onClick` " +
      "action with a label and/or icon, or a `component`).",
  );
}
