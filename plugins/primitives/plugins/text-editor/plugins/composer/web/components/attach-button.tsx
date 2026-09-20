import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import type { IconType } from "react-icons";

export interface ComposerAttachButtonProps {
  /** Glyph shown while the button is off. */
  icon: IconType;
  /** Glyph shown while it is on. Defaults to {@link ComposerAttachButtonProps.icon}. */
  activeIcon?: IconType;
  /** The one label. It is the SAME in both states — see below. */
  label: string;
  active: boolean;
  onToggle: (next: boolean) => void;
  /** Hover title. Defaults to the label, so it also never changes with state. */
  title?: string;
  disabled?: boolean;
}

/**
 * A named attach toggle on the composer's attach row — "Attach page URL" and
 * its kin.
 *
 * **One label, one width, in both states.** Turning it on tints it and swaps
 * its glyph; it never prints what it attached and never grows. That is the
 * whole point of the control: a button that changed its own width on click
 * shoved every neighbour along the row, and a button that printed the attached
 * value turned a one-line row into two.
 *
 * Tinted rather than filled: these chips sit in a row of their own kind and are
 * flipped often, so a block of primary on each one reads as an alert rather
 * than as "this is attached".
 */
export function ComposerAttachButton({
  icon,
  activeIcon,
  label,
  active,
  onToggle,
  title,
  disabled,
}: ComposerAttachButtonProps) {
  const Icon = active ? (activeIcon ?? icon) : icon;
  return (
    <ToggleChip
      active={active}
      variant="tinted"
      icon={<Icon aria-hidden />}
      disabled={disabled}
      title={title ?? label}
      onClick={() => onToggle(!active)}
    >
      {label}
    </ToggleChip>
  );
}
