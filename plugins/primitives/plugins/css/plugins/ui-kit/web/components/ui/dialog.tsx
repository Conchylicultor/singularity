import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils"
import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/portal-forward"
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

function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  const forwarded = usePortalForwardedAttrs()
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        {...forwarded}
        // eslint-disable-next-line spacing/no-adhoc-spacing -- pt-[20vh] is a viewport-relative dialog offset the density ramp can't express
        className={cn(
          "fixed inset-0 z-popover flex items-start justify-center pt-[20vh] outline-none",
          className
        )}
        {...props}
      >
        {/* Floating panel = fresh flow root: reset the ambient single-line
            contract so content opened from a line container wraps instead of
            collapsing onto one line. */}
        <OverlayBoundary kind="dialog">
          <SingleLineProvider value={false}>
            <ContentScope fill={false}>{children}</ContentScope>
          </SingleLineProvider>
        </OverlayBoundary>
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
