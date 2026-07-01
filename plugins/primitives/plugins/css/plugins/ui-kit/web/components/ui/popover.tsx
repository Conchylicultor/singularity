import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils"
import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/portal-forward"
import { SURFACE_LEVELS } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/surface"
import {
  POPOVER_WIDTH,
  POPOVER_PADDING,
  type PopoverWidth,
  type PopoverPadding,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/popover-width"
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web"
import { SingleLineProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/single-line"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />
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
  className,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & {
    /** Closed width role; default size-to-content. */
    width?: PopoverWidth
    /** Padding role; default `md` (the previously baked-in padding). */
    padding?: PopoverPadding
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
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            SURFACE_LEVELS.overlay,
            "z-popover origin-(--transform-origin) duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            POPOVER_WIDTH[width],
            POPOVER_PADDING[padding],
            className,
          )}
          {...props}
        >
          {/* A floating panel is a fresh flow root: reset the ambient
              single-line contract so content opened from a line container
              (Bar/Row) wraps/pretty-prints instead of collapsing onto one
              line. Line containers inside re-assert `true` locally. */}
          <SingleLineProvider value={false}>
            <ContentScope fill={false}>{children}</ContentScope>
          </SingleLineProvider>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
