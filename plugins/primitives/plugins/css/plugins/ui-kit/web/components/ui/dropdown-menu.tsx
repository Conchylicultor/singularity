import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils";
import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/portal-forward";
import { usePopupOpenMirror } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/popup-open-mirror";
import { useFrameFocusDismiss } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/frame-focus-dismiss";
import { OverlayPanel } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/overlay-panel";
import type {
  PopoverWidth,
  PopoverPadding,
  PopoverMaxHeight,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/popover-width";
import {
  MENU_LABEL,
  MENU_ROW,
  MENU_SEPARATOR,
  MENU_VALUE,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/menu-row";
import { usePortalContainer } from "@plugins/primitives/plugins/overlay/plugins/portal-host/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const chevronRightIcon = symbol("chevron-right");
const checkIcon = symbol("check");

function DropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: Omit<MenuPrimitive.Root.Props, "actionsRef">) {
  // Publish open state to the enclosing PopupOpenScope, so chrome that must
  // hold itself visible while its menu is open (a hover-revealed row-action
  // cluster — the menu's own anchor) reads a typed boolean.
  const { onOpenChange: handleOpenChange, isOpen } = usePopupOpenMirror({
    open,
    defaultOpen,
    onOpenChange,
  });
  // A click inside an iframe never reaches base-ui's outside-press listener.
  const actionsRef = useFrameFocusDismiss<MenuPrimitive.Root.Actions>(isOpen);
  return (
    <MenuPrimitive.Root
      data-slot="dropdown-menu"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      actionsRef={actionsRef}
      {...props}
    />
  );
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  const container = usePortalContainer();
  return (
    <MenuPrimitive.Portal
      data-slot="dropdown-menu-portal"
      container={container}
      {...props}
    />
  );
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  width = "menu-min",
  padding = "xs",
  maxHeight = "viewport",
  className,
  header,
  children,
  ...props
}: Omit<MenuPrimitive.Popup.Props, "render" | "className"> &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & {
    /**
     * Plain override class landing LAST on the panel. Narrower than base-ui's
     * `className`, which also accepts a `(state) => string` form: the panel is
     * composed by `OverlayPanel`, which has no access to the popup's state, and
     * the state-driven variants are already expressed as `data-*` selectors in
     * the panel's own class bundle.
     */
    className?: string;
    /**
     * Closed width role; default `menu-min` — sized to the items, floored at
     * the theme's menu minimum (`popoverWidthMenuMin`), and never the
     * trigger's width (a menu hung off a wide trigger is still a menu). A
     * picker standing in for a field passes `anchor-min` to keep at least its
     * trigger's width.
     */
    width?: PopoverWidth;
    /** Padding role; default `xs` (the previously baked-in menu padding). */
    padding?: PopoverPadding;
    /**
     * Max-height COMFORT CAP on top of the unconditional viewport fit; default
     * `viewport` (fit the space Floating UI measured, and nothing tighter).
     */
    maxHeight?: PopoverMaxHeight;
    /** Optional sticky header rendered above the items (skipped by keyboard nav — not an Item). */
    header?: React.ReactNode;
  }) {
  const forwarded = usePortalForwardedAttrs();
  // Inside a PortalHost (a fullscreen region), draw there: under `body` the
  // popup would be invisible.
  const container = usePortalContainer();
  return (
    <MenuPrimitive.Portal container={container}>
      <MenuPrimitive.Positioner
        {...forwarded}
        className="isolate z-popover outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        {/* The popup IS the shared panel: base-ui owns the state machine, and
            `render` hands it `OverlayPanel` as the element to clone its merged
            props onto (`{...props}` stays BEFORE `render`, and `render` is
            `Omit`ed from the public prop type, so a caller can never replace the
            panel). Chrome, geometry, viewport fit and the content-context resets
            all live in one place — see `overlay-panel.tsx`. */}
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          {...props}
          render={
            <OverlayPanel
              width={width}
              padding={padding}
              maxHeight={maxHeight}
              header={header}
              className={className}
            >
              {children}
            </OverlayPanel>
          }
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(MENU_LABEL, "data-inset:pl-xl", className)}
      {...props}
    />
  );
}

/**
 * A labelled menu section: the `Group` + `GroupLabel` pair rendered together as
 * one unit. Base-ui's `Menu.GroupLabel` (our `DropdownMenuLabel`) requires an
 * ancestor `Menu.Group` context — a groupless label throws a hard runtime error
 * (#31 `useMenuGroupRootContext`) that white-screens the menu. This composed
 * primitive makes that coupling structurally impossible: the label always sits
 * inside its group, alongside the section's items (so `aria-labelledby` is
 * correct). Prefer this over a hand-rolled `DropdownMenuGroup` + `DropdownMenuLabel`
 * for any labelled section; the `no-groupless-dropdown-menu-label` lint rule
 * enforces it.
 */
function DropdownMenuSection({
  label,
  inset,
  children,
  ...props
}: MenuPrimitive.Group.Props & {
  /** The section heading, rendered as the group's `GroupLabel`. */
  label: React.ReactNode;
  /** Indent the label to align with inset items. */
  inset?: boolean;
}) {
  return (
    <DropdownMenuGroup {...props}>
      <DropdownMenuLabel inset={inset}>{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        // The shared menu row (`theme/menu-row.ts`): geometry, paint, the
        // destructive tone (keyed on `data-variant`) and disabled. Only the
        // layout and the highlight's state model are this component's.
        MENU_ROW,
        "relative flex items-center data-highlighted:menu-row-lit data-inset:pl-xl",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        // An open submenu keeps its trigger lit while the pointer is inside it.
        MENU_ROW,
        "flex items-center data-highlighted:menu-row-lit data-popup-open:menu-row-lit data-inset:pl-xl",
        className,
      )}
      {...props}
    >
      {children}
      <Icon icon={chevronRightIcon} className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  // Same role as the menu it opened from, so a submenu sizes like every
  // other menu (its "anchor" is one row of the parent, never a width to match).
  width = "menu-min",
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      width={width}
      // Only the shadow step differs from the shared panel — a submenu floats one
      // level above the menu it opened from. Everything else (surface bundle,
      // animation, padding) comes from `OverlayPanel`; re-declaring it here was a
      // second copy of the same bundle layered on the first.
      className={cn("shadow-lg", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        MENU_ROW,
        "grid grid-cols-[minmax(0,1fr)_auto] items-center data-highlighted:menu-row-lit data-inset:pl-xl",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="min-w-0 truncate lead-icon-sm [&>svg]:inline-block [&>svg]:shrink-0 [&>svg]:align-middle">
        {children}
      </span>
      <span
        className="pointer-events-none flex size-4 items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <Icon icon={checkIcon} className="text-primary" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        MENU_ROW,
        "grid grid-cols-[minmax(0,1fr)_auto] items-center data-highlighted:menu-row-lit data-inset:pl-xl",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate lead-icon-sm [&>svg]:inline-block [&>svg]:shrink-0 [&>svg]:align-middle">
        {children}
      </span>
      <span
        className="pointer-events-none flex size-4 items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <Icon icon={checkIcon} className="text-primary" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(MENU_SEPARATOR, className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(cn(MENU_VALUE, "ml-auto"), className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSection,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
