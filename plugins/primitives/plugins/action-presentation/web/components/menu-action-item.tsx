import {
  DropdownMenuItem,
  DropdownMenuShortcut,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import type { ComponentType, MouseEventHandler } from "react";

export interface MenuActionItemProps {
  icon: ComponentType<{ className?: string }>;
  /** The action's name — the visible row text here, the aria-label inline. */
  label: string;
  disabled?: boolean;
  /** Raw shortcut string (e.g. `"mod+k"`), formatted for display. */
  shortcut?: string;
  /**
   * Typed as a plain DOM handler so the SAME handler drops into either
   * presentation: React's event-handler types are bivariant, so an inline
   * button's `MouseEventHandler<HTMLButtonElement>` and this menu row's own
   * element type are mutually assignable.
   */
  onClick?: MouseEventHandler<HTMLElement>;
}

/**
 * The menu form of an `{ icon, label, onClick }` action: a labelled dropdown row
 * instead of a ghost icon button. The twin of `IconButton`'s inline form — the
 * two are selected between by the ambient `useActionPresentation()`, never by
 * the call site.
 */
export function MenuActionItem({
  icon: Icon,
  label,
  disabled,
  shortcut,
  onClick,
}: MenuActionItemProps) {
  return (
    <DropdownMenuItem disabled={disabled} onClick={onClick}>
      <Icon />
      {label}
      {shortcut ? (
        <DropdownMenuShortcut>{formatShortcutLabel(shortcut)}</DropdownMenuShortcut>
      ) : null}
    </DropdownMenuItem>
  );
}
