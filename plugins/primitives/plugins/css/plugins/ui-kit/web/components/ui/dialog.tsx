import type * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils"
import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/portal-forward"
import { OverlayPanel } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/components/overlay-panel"

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

type DialogContentProps = Omit<DialogPrimitive.Popup.Props, "className"> & {
  /**
   * Plain override class landing LAST on the panel. Narrower than base-ui's
   * `className`, which also accepts a `(state) => string` form: this class goes
   * to the inner `OverlayPanel`, which has no access to the popup's state (and
   * the state-driven variants live as `data-*` selectors in the panel's own
   * class bundle anyway).
   */
  className?: string
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
        {/* The dialog's box IS the shared panel — see `overlay-panel.tsx`. A
            dialog is CENTERED rather than anchored, so it publishes no
            `--available-height` of its own; injecting one turns the panel's
            unconditional clamp into exactly this surface's historical
            `max-h-[75vh]`, instead of leaving it at the `100vh` fallback. The
            cap only ever bites past 20vh top + 75vh = 95vh, so a caller's inner
            ScrollArea stays the only active scroller. `POPOVER_WIDTH.content`
            (the default role) is the empty string, so `DIALOG_SIZES` owns width
            unopposed, and `padding="lg"` is the same `p-lg` this panel always
            had. */}
        <OverlayPanel
          data-slot="dialog-panel"
          padding={padded ? "lg" : "none"}
          style={{ "--available-height": "75vh" } as React.CSSProperties}
          className={cn(DIALOG_SIZES[size], className)}
        >
          {children}
        </OverlayPanel>
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
