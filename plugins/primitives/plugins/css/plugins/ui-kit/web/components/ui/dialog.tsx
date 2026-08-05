import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils"
import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/portal-forward"
import { SURFACE_LEVELS } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/surface"
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web"
import { OverlayBoundary } from "@plugins/primitives/plugins/overlay-boundary/web"
import { SingleLineProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/single-line"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-popover bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

const DIALOG_SIZES = {
  sm: "w-full max-w-md",
  md: "w-full max-w-lg",
  lg: "w-full max-w-4xl",
} as const

type DialogContentProps = DialogPrimitive.Popup.Props & {
  /** Panel width tier. Default "md". */
  size?: keyof typeof DIALOG_SIZES
  /** Default panel padding (p-lg). Pass false for flush headers/rows that own their own insets. Default true. */
  padded?: boolean
}

function DialogContent({
  className,
  children,
  size = "md",
  padded = true,
  ...props
}: DialogContentProps) {
  const forwarded = usePortalForwardedAttrs()
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        {...forwarded}
        // eslint-disable-next-line spacing/no-adhoc-spacing -- pt-[20vh] is a viewport-relative dialog offset the density ramp can't express
        className="fixed inset-0 z-popover flex items-start justify-center pt-[20vh] outline-none"
        {...props}
      >
        <div
          data-slot="dialog-panel"
          // Panel box = the SURFACE_LEVELS.overlay bundle (the same one Popover /
          // DropdownMenu / Surface use) + one width tier + optional padding.
          // overflow-y-auto clips children to the rounded corners (replacing callers'
          // <Clip>) and scrolls ONLY if the whole panel would exceed the viewport
          // (20vh top + 75vh = 95vh). No current caller reaches that cap, so their own
          // internal ScrollAreas stay the only active scroller (no double scrollbar).
          // eslint-disable-next-line spacing/no-adhoc-spacing -- p-lg is the density-ramp token; ui-kit sits below the spacing primitive so it can't route through <Inset>
          className={cn(
            SURFACE_LEVELS.overlay,
            DIALOG_SIZES[size],
            "max-h-[75vh] overflow-y-auto",
            padded && "p-lg",
            className,
          )}
        >
          {/* Floating panel = fresh flow root: reset the ambient single-line contract. */}
          <OverlayBoundary kind="dialog">
            <SingleLineProvider value={false}>
              <ContentScope fill={false}>{children}</ContentScope>
            </SingleLineProvider>
          </OverlayBoundary>
        </div>
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-subheading text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
}
