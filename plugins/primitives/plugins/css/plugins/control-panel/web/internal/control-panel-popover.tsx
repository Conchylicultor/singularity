import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";
import type { ComponentProps } from "react";

import { ControlPanel } from "./control-panel";
import { ControlPanelStack } from "./panel-stack";

/** The only width dial in the vocabulary. */
export type ControlPanelSize = "menu" | "builder";

type Positioning = Pick<
  ComponentProps<typeof PopoverContent>,
  "align" | "side"
>;

export interface ControlPanelPopoverProps extends Positioning {
  /** The trigger element — open/close is merged in via base-ui's render prop. */
  trigger: React.ReactElement;
  /**
   * `menu` for a list of choices, `builder` for a rule row. There is no width,
   * padding or content-class prop — see below.
   */
  size?: ControlPanelSize;
  /** Names the panel for assistive tech. */
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * The sanctioned way to open a control panel.
 *
 * What it does NOT have is the point: no `width`, no `padding`, no
 * `contentClassName`. Those are exactly the props that let three panels in one
 * toolbar end up 481, 384 and 256 pixels wide — each set by whatever was widest
 * inside it. `size` maps to a width ROLE, the padding is the panel body's, and
 * there is nowhere to smuggle a measurement through. That is what makes "width
 * is a role" enforceable rather than aspirational: the escape is absent from the
 * type, not defaulted in it.
 *
 * There is no `tooltip` prop either — the caller's trigger (typically an
 * `IconButton`) already owns its tooltip, and a second one here would be a
 * second source for the same string.
 *
 * The children are wrapped in a `ControlPanel.Stack`, so `usePanelStack()` works
 * inside ANY panel opened this way. A sub-panel is then a push, never a popover
 * opened from inside a popover.
 */
export function ControlPanelPopover({
  trigger,
  size = "menu",
  label,
  align = "start",
  side = "bottom",
  open,
  onOpenChange,
  children,
}: ControlPanelPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} side={side} width={size} padding="none">
        <ControlPanel aria-label={label}>
          <ControlPanelStack root={children} />
        </ControlPanel>
      </PopoverContent>
    </Popover>
  );
}
