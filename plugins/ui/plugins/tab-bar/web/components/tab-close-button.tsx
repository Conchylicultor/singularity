import type React from "react";
import { MdClose } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { hoverRevealTargetWithGroupFocus } from "@plugins/primitives/plugins/hover-reveal/web";

export interface TabCloseButtonProps {
  /** Tab label, used for the accessible name (`Close <label>`). */
  label: string;
  onClose: () => void;
  /** The owning tab's active state. The active tab's close stays reachable. */
  active: boolean;
}

/**
 * The shared trailing `×` close control for tab variants. Composes the `Center`
 * primitive (`as="button"`) so the glyph is centered without any ad-hoc flex
 * mechanics. The reveal couples opacity↔pointer-events via the `hover-reveal`
 * primitive's group pair, so the hidden control is never a live click-target —
 * the variant root carries `hoverRevealGroup`, this button carries
 * `hoverRevealTargetWithGroupFocus`. That group-focus variant (not the default
 * `hoverRevealTarget`) is deliberate: the tab root is a dedicated `role="button"`
 * trigger distinct from this `×`, so keyboard-focusing the tab should reveal its
 * close. The active tab overrides the hide so its close is always reachable.
 * `stopPropagation` keeps a close from also activating the tab / starting a drag
 * the consumer wired on the root.
 */
export function TabCloseButton({ label, onClose, active }: TabCloseButtonProps) {
  return (
    <Center
      as="button"
      aria-label={`Close ${label}`}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onClose();
      }}
      className={cn(
        "size-4 rounded-sm text-muted-foreground transition-[color,background-color,opacity] hover:bg-foreground/10 hover:text-foreground",
        active ? "opacity-70" : hoverRevealTargetWithGroupFocus,
      )}
    >
      <MdClose className="icon-auto" />
    </Center>
  );
}
