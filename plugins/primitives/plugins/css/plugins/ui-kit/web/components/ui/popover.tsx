import type * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/portal-forward"
import { usePopupOpenMirror } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/popup-open-mirror"
import { OverlayPanel } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/overlay-panel"
import type {
  PopoverWidth,
  PopoverPadding,
  PopoverMaxHeight,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/popover-width"

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: PopoverPrimitive.Root.Props) {
  // See `usePopupOpenMirror`: the enclosing PopupOpenScope reads this instead of
  // a CSS selector over base-ui's own open-state attribute.
  const handleOpenChange = usePopupOpenMirror({ open, defaultOpen, onOpenChange })
  return (
    <PopoverPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      {...props}
    />
  )
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  width = "content",
  padding = "md",
  maxHeight = "viewport",
  header,
  className,
  children,
  ...props
}: Omit<PopoverPrimitive.Popup.Props, "render" | "className"> &
  Pick<
    PopoverPrimitive.Positioner.Props,
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
    /** Closed width role; default size-to-content. */
    width?: PopoverWidth
    /** Padding role; default `md` (the previously baked-in padding). */
    padding?: PopoverPadding
    /**
     * Max-height COMFORT CAP on top of the unconditional viewport fit; default
     * `viewport` (fit the space Floating UI measured, and nothing tighter).
     */
    maxHeight?: PopoverMaxHeight
    /** Optional sticky header rendered above the content, full-bleed through the padding. */
    header?: React.ReactNode
  }) {
  // Portaled content escapes the originating window's DOM subtree to
  // document.body, so it no longer matches that window's [data-theme-scope]
  // block. Re-stamp the scope here (flowing through React context, which
  // crosses portals) so the popup adopts the launching window's scoped theme
  // instead of the global :root chrome theme. Undefined → no attribute → default.
  const forwarded = usePortalForwardedAttrs()
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
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
        <PopoverPrimitive.Popup
          data-slot="popover-content"
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
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
