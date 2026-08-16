import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Kbd } from "@plugins/primitives/plugins/tooltip/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import type { ComponentType, MouseEventHandler } from "react";

export interface PanelActionRowProps {
  icon: ComponentType<{ className?: string }>;
  /** The action's name — the visible row text here, the aria-label inline. */
  label: string;
  disabled?: boolean;
  /** Raw shortcut string (e.g. `"mod+k"`), formatted for display. */
  shortcut?: string;
  /**
   * Typed as a plain DOM handler so the SAME handler drops into either form:
   * React's event-handler types are bivariant, so an inline button's
   * `MouseEventHandler<HTMLButtonElement>` and this row's own element type are
   * mutually assignable.
   */
  onClick?: MouseEventHandler<HTMLElement>;
}

/**
 * The renderer of the `"row"` rung: a labelled row in the overflow panel
 * instead of a ghost icon button. The twin of `IconButton`'s full form,
 * selected between by the region's answer to `useActionForm`, never by the call
 * site.
 *
 * **It renders standalone** — no menu, no popover, no context of any kind above
 * it — and that is the whole point. The panel that hosts relocated widgets is
 * always mounted (it holds their live DOM: a Web Audio volume control, a jog
 * wheel mid-drag), so it can never be a `DropdownMenuContent`, which unmounts
 * its children on close. It is a plain dialog, and `role="menu"` would be wrong
 * there anyway: a menu's roving tabindex and typeahead eat the arrow keys a
 * relocated `role="slider"` needs. The honest cost is that the panel has no
 * typeahead and no arrow-key roving — it is Tab + Enter + Esc.
 *
 * Composes `Line` (as `Row` itself does) rather than `Row`, because
 * `Row → row-actions → IconButton → action-presentation` is a cycle
 * `./singularity check plugin-boundaries` rejects. The constraint is narrow — a
 * component `IconButton` ITSELF renders cannot use `Row`, which today means this
 * one — so it says nothing about `Row` for ordinary consumers. Hence the handful
 * of chrome classes below that would otherwise come from `Row`; do not "fix"
 * them back without breaking that edge first.
 */
export function PanelActionRow({
  icon: Icon,
  label,
  disabled,
  shortcut,
  onClick,
}: PanelActionRowProps) {
  return (
    <Line
      as="button"
      type="button"
      // Always a real <button>, so the row is keyboard-reachable and
      // Enter/Space-activatable with nothing above it to supply that.
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full gap-sm rounded-md p-row text-left text-body",
        "[&_svg:not([class*='size-'])]:icon-auto",
        "hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <Icon />
      {/* The one flexible cell: the label absorbs the slack and ellipsizes, so a
          long action name cannot push the shortcut out of the panel. */}
      <Fill>
        <Text>{label}</Text>
      </Fill>
      {shortcut ? <Kbd>{formatShortcutLabel(shortcut)}</Kbd> : null}
    </Line>
  );
}
