import {
  Button,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import {
  WithTooltip,
  Kbd,
} from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import {
  useActionForm,
  PanelActionRow,
} from "@plugins/primitives/plugins/action-presentation/web";

export interface IconButtonProps
  extends
    Omit<ComponentProps<typeof Button>, "children" | "size">,
    DensityControlled {
  icon: ComponentType<{ className?: string }>;
  /** The action's name: the aria-label + tooltip at full size, the visible row text in row form. */
  label: string;
  /** Full-form only — INERT in row form (the label is already visible text there). */
  tooltip?: ReactNode;
  shortcut?: string;
  /** Full-form only — INERT in row form (a panel row has no ghost box to place). */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * A ladder rung this widget can render itself as. Module scope, not an inline
 * literal, purely for the reader: it is the one thing `IconButton` says about
 * itself to a bar, and it says it once. `useActionForm` keys its declaration on
 * the ladder's VALUE, so an inline literal would behave identically.
 *
 * Deliberately NOT `"compact"`: an icon button is already an icon-only square,
 * so it has no narrower form of itself to offer — below full it either stays as
 * it is or becomes a labelled row.
 */
const ICON_BUTTON_LADDER = { shrinksTo: ["row"] } as const;

/**
 * `IconButton` IS the generic `{ icon, label, onClick }` action shape, so it is
 * the one widget for which "a labelled row" is a lossless smaller form of
 * itself — and therefore the one that declares the `"row"` rung. When a bar runs
 * out of room and relocates it behind a `⋯`, the same action renders as that
 * row. The full-form-only dials — `variant`, `className`, `tooltip`, `side` —
 * are INERT in that form.
 */
export function IconButton({
  icon: Icon,
  label,
  tooltip,
  shortcut,
  variant = "ghost",
  side,
  ...props
}: IconButtonProps) {
  // Unconditional (hook order): declare the ladder and read the region's
  // answer, then one branch on it. With no bar above — every ordinary call site
  // — this is a constant `"full"` and the declaration is a no-op.
  const form = useActionForm(ICON_BUTTON_LADDER);
  if (form === "row") {
    return (
      <PanelActionRow
        icon={Icon}
        label={label}
        onClick={props.onClick}
        disabled={props.disabled}
        shortcut={shortcut}
      />
    );
  }

  // An icon button NEVER sizes itself — `aspect="icon"` makes Button derive its
  // square box from the ambient control density, which the containing row/slot
  // owns (via `ControlSizeProvider` or a slot's `controlSize` config). This makes
  // a single button physically unable to desync from its neighbors.
  const content = shortcut ? (
    <>
      {tooltip ?? label}
      <Kbd>{formatShortcutLabel(shortcut)}</Kbd>
    </>
  ) : (
    (tooltip ?? label)
  );

  return (
    <WithTooltip content={content} side={side}>
      <Button variant={variant} aspect="icon" aria-label={label} {...props}>
        <Icon />
      </Button>
    </WithTooltip>
  );
}
