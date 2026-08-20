import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  type PopoverMaxHeight,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";
import type { ComponentProps } from "react";

import { ControlPanel } from "./control-panel";
import { ControlPanelStack } from "./panel-stack";

/** The only width dial in the vocabulary. */
export type ControlPanelSize = "menu" | "builder" | "picker";

type Positioning = Pick<
  ComponentProps<typeof PopoverContent>,
  "align" | "side"
>;

export interface ControlPanelPopoverProps extends Positioning {
  /** The trigger element — open/close is merged in via base-ui's render prop. */
  trigger: React.ReactElement;
  /**
   * `menu` for a list of choices, `builder` for a rule row, `picker` for a panel
   * whose body is a grid (swatches, icons, covers). There is no width, padding
   * or content-class prop — see below.
   */
  size?: ControlPanelSize;
  /**
   * Comfort cap on the panel's HEIGHT, from `OverlayPanel`'s closed scale;
   * default `viewport`. A long list wants `lg` so it does not open as a
   * viewport-tall wall.
   *
   * This is not the width prop wearing a hat. Invariant #5 is about WIDTH, and
   * the reason there is no `width` here — three panels in one toolbar at 481,
   * 384 and 256px, each set by whatever was widest inside it — has no height
   * analogue: fitting the viewport and scrolling is already unconditional in
   * `OverlayPanel`, so this only ever makes a panel SHORTER than the space it
   * has. It is a closed scale for the same reason `size` is: there is nowhere to
   * smuggle a measurement through.
   */
  maxHeight?: PopoverMaxHeight;
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
 * `contentClassName`. (`maxHeight` IS here — a cap on height is not a width
 * measurement, and the panel already fits the viewport unconditionally; see the
 * prop.) Those are exactly the props that let three panels in one
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
  maxHeight,
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
      <PopoverContent
        align={align}
        side={side}
        width={size}
        maxHeight={maxHeight}
        padding="none"
      >
        <ControlPanel aria-label={label}>
          <ControlPanelStack root={children} />
        </ControlPanel>
      </PopoverContent>
    </Popover>
  );
}
