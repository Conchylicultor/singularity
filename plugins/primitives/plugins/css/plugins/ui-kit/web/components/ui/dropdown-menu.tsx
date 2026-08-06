import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils"
import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/portal-forward"
import { usePopupOpenMirror } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/popup-open-mirror"
import { OverlayPanel } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/overlay-panel"
import type {
  PopoverWidth,
  PopoverPadding,
  PopoverMaxHeight,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/popover-width"
import { MdChevronRight, MdCheck } from "react-icons/md"

function DropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: MenuPrimitive.Root.Props) {
  // Publish open state to the enclosing PopupOpenScope, so chrome that must
  // hold itself visible while its menu is open (a hover-revealed row-action
  // cluster — the menu's own anchor) reads a typed boolean.
  const handleOpenChange = usePopupOpenMirror({ open, defaultOpen, onOpenChange })
  return (
    <MenuPrimitive.Root
      data-slot="dropdown-menu"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      {...props}
    />
  )
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  width = "anchor-min",
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
    className?: string
    /** Closed width role; default "at least the trigger, growing past it". */
    width?: PopoverWidth
    /** Padding role; default `xs` (the previously baked-in menu padding). */
    padding?: PopoverPadding
    /**
     * Max-height COMFORT CAP on top of the unconditional viewport fit; default
     * `viewport` (fit the space Floating UI measured, and nothing tighter).
     */
    maxHeight?: PopoverMaxHeight
    /** Optional sticky header rendered above the items (skipped by keyboard nav — not an Item). */
    header?: React.ReactNode
  }) {
  const forwarded = usePortalForwardedAttrs()
  return (
    <MenuPrimitive.Portal>
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
  )
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-xs py-xs text-caption font-medium text-muted-foreground data-inset:pl-xl",
        className
      )}
      {...props}
    />
  )
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
  label: React.ReactNode
  /** Indent the label to align with inset items. */
  inset?: boolean
}) {
  return (
    <DropdownMenuGroup {...props}>
      <DropdownMenuLabel inset={inset}>{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-xs rounded-md px-xs py-xs text-body outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-xl data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-xs rounded-md px-xs py-xs text-body outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-xl data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <MdChevronRight className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  // A submenu's "anchor" is one row of its parent menu, so anchor-relative width
  // is meaningless here: size to content over a small floor instead.
  width = "snug",
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
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "grid cursor-default grid-cols-[minmax(0,1fr)_auto] items-center gap-xs rounded-md py-xs pl-xs text-body outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-xl data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="min-w-0 truncate [&>svg]:mr-xs [&>svg]:inline-block [&>svg]:shrink-0 [&>svg]:align-middle">
        {children}
      </span>
      <span
        className="pointer-events-none flex size-4 items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <MdCheck
          />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "grid cursor-default grid-cols-[minmax(0,1fr)_auto] items-center gap-xs rounded-md py-xs pl-xs text-body outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-xl data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="min-w-0 truncate [&>svg]:mr-xs [&>svg]:inline-block [&>svg]:shrink-0 [&>svg]:align-middle">
        {children}
      </span>
      <span
        className="pointer-events-none flex size-4 items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <MdCheck
          />
        </MenuPrimitive.RadioItemIndicator>
      </span>
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      // eslint-disable-next-line spacing/no-adhoc-spacing -- -mx-1 full-bleeds the divider through the menu's p-xs padding; my-1 is its vertical inset; no named margin utility
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-caption tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
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
}
