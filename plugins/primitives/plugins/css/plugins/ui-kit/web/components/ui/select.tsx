import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils";
import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/portal-forward";
import { usePopupOpenMirror } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/popup-open-mirror";
import { OverlayPanel } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/overlay-panel";
import type {
  PopoverWidth,
  PopoverPadding,
  PopoverMaxHeight,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/popover-width";
import { MdExpandMore, MdCheck, MdExpandLess } from "react-icons/md";

// Kept generic over base-ui's own `<Value, Multiple>` params: this was a bare
// `const Select = SelectPrimitive.Root` alias, and a non-generic wrapper would
// silently erase value inference for every consumer selecting object values.
function Select<Value, Multiple extends boolean | undefined = false>({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  // See `usePopupOpenMirror`: the enclosing PopupOpenScope reads this instead of
  // a CSS selector over base-ui's own open-state attribute.
  const handleOpenChange = usePopupOpenMirror({
    open,
    defaultOpen,
    onOpenChange,
  });
  return (
    <SelectPrimitive.Root<Value, Multiple>
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      {...props}
    />
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      // No inset of its own: the panel opens the region (see `SelectContent`),
      // so a group lives in it and its items land on the rail by doing nothing.
      className={cn("scroll-my-1", className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      // eslint-disable-next-line radius/no-adhoc-radius -- intentional min() clamp pins the sm-size corner so it never exceeds 10px regardless of Shape preset
      className={cn(
        "focus-ring flex w-fit items-center justify-between gap-xs rounded-lg border border-input bg-transparent py-sm pr-sm pl-sm text-body whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-xs dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <MdExpandMore className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  header,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  width = "anchor",
  padding = "xs",
  maxHeight = "viewport",
  ...props
}: Omit<SelectPrimitive.Popup.Props, "render" | "className"> &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  > & {
    /**
     * Plain override class landing LAST on the panel. Narrower than base-ui's
     * `className`, which also accepts a `(state) => string` form: the panel is
     * composed by `OverlayPanel`, which has no access to the popup's state, and
     * the state-driven variants are already expressed as `data-*` selectors in
     * the panel's own class bundle.
     */
    className?: string;
    /** Closed width role; default "exactly the trigger's width". */
    width?: PopoverWidth;
    /**
     * Padding role; default `xs` — the panel OPENS the region and items live in
     * it. (It used to default to `none` and let `SelectGroup` inset the rows
     * instead: the same inversion the rail contract exists to delete, since a
     * raw child dropped beside a group then sat flush against the panel edge.)
     */
    padding?: PopoverPadding;
    /**
     * Max-height COMFORT CAP on top of the unconditional viewport fit; default
     * `viewport` (fit the space Floating UI measured, and nothing tighter).
     */
    maxHeight?: PopoverMaxHeight;
    /** Optional sticky header rendered above the item list (not a focusable item). */
    header?: React.ReactNode;
  }) {
  const forwarded = usePortalForwardedAttrs();
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        {...forwarded}
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-popover"
      >
        {/* The popup IS the shared panel (see `overlay-panel.tsx`); `{...props}`
            stays BEFORE `render` and `render` is `Omit`ed from the public prop
            type, so a caller can never replace it.

            The arrows and the list stay DIRECT children of the panel, and the
            header stays a plain child rather than `OverlayPanel`'s `header` prop:
            with `alignItemWithTrigger` (the default) `SelectPopup` writes
            `height: 100%` onto the popup and `max-height: 100%` onto the list, so
            any intervening auto-height box would break that percentage chain,
            and the arrows are `position: absolute` against the panel's own
            `relative`. It carries `rail-bleed` instead of the `header` prop's
            fixed negative margins, so its rule spans the panel at whatever
            padding role the panel is actually on. */}
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          {...props}
          render={
            <OverlayPanel
              width={width}
              padding={padding}
              maxHeight={maxHeight}
              className={cn(
                // `relative` is the arrows' containing block; `isolate` keeps the
                // sticky header / arrows stacking inside the panel. The
                // animate-none is genuinely Select-specific: with
                // `alignItemWithTrigger` base-ui places the popup by measuring it,
                // so a zoom/slide entrance would fight its own measurement.
                "relative isolate data-[align-trigger=true]:animate-none",
                className,
              )}
            >
              <SelectScrollUpButton />
              {header != null && (
                <div className="sticky top-0 z-raised border-b bg-popover rail-bleed py-xs">
                  {header}
                </div>
              )}
              <SelectPrimitive.List>{children}</SelectPrimitive.List>
              <SelectScrollDownButton />
            </OverlayPanel>
          }
        />
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(
        "px-xs py-xs text-caption text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "grid w-full cursor-default grid-cols-[minmax(0,1fr)_auto] items-center gap-xs rounded-md py-xs pl-xs text-body outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-sm",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 truncate [&>svg]:mr-sm [&>svg]:inline-block [&>svg]:shrink-0 [&>svg]:align-middle">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none flex size-4 items-center justify-center" />
        }
      >
        <MdCheck className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      // `rail-bleed` full-bleeds the hairline through the panel's own rail
      // (whatever it is), instead of hardcoding the one step the group used to pad by.
      // eslint-disable-next-line spacing/no-adhoc-spacing -- my-1 is the divider's vertical inset; no named margin utility
      className={cn(
        "pointer-events-none rail-bleed my-1 h-px bg-border",
        className,
      )}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-raised flex w-full cursor-default items-center justify-center bg-popover py-xs [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <MdExpandLess />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-raised flex w-full cursor-default items-center justify-center bg-popover py-xs [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <MdExpandMore />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
