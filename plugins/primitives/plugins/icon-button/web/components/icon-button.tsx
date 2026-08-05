import {
  Button,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import {
  WithTooltip,
  Kbd,
} from "@plugins/primitives/plugins/tooltip/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import {
  useActionPresentation,
  MenuActionItem,
} from "@plugins/primitives/plugins/action-presentation/web";

export interface IconButtonProps
  extends Omit<ComponentProps<typeof Button>, "children" | "size">,
    DensityControlled {
  icon: ComponentType<{ className?: string }>;
  /** The action's name: the aria-label + tooltip inline, the visible row text in menu form. */
  label: string;
  /** Inline-only — INERT in menu form (the label is already visible text there). */
  tooltip?: ReactNode;
  shortcut?: string;
  /** Inline-only — INERT in menu form (a menu row has no ghost box to place). */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * `IconButton` IS the generic `{ icon, label, onClick }` action shape, so it is
 * where the region's presentation is honored: inside an `<ActionPresentation
 * mode="menu">` region (today: the `overflow` reorder node) the same action
 * renders as a labelled menu row instead of a ghost icon box. The inline-only
 * dials — `variant`, `className`, `tooltip`, `side` — are INERT in that form.
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
  // Unconditional (hook order): the region's answer, then one branch on it.
  const presentation = useActionPresentation();
  if (presentation === "menu") {
    return (
      <MenuActionItem
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
    tooltip ?? label
  );

  return (
    <WithTooltip content={content} side={side}>
      <Button variant={variant} aspect="icon" aria-label={label} {...props}>
        <Icon />
      </Button>
    </WithTooltip>
  );
}
