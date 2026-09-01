import { Toaster as Sonner } from "sonner";
import { useColorMode } from "@plugins/ui/plugins/theme-engine/web";
import { useChromeThemeScope } from "@plugins/apps-core/plugins/theme-scope/web";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import { Theme } from "@plugins/primitives/plugins/css/plugins/theme-boundary/web";
import { DismissAllButton } from "./dismiss-all-button";

/**
 * Sonner's own `VIEWPORT_OFFSET` default, restated here because the stack-action
 * strip has to land on the exact same corner inset as the toast stack it sits
 * under. Kept as one number for both viewports so the vertical geometry is
 * identical everywhere (sonner's narrower mobile inset still applies sideways).
 */
const VIEWPORT_OFFSET = 24;
/** Breathing room between the strip and the front toast above it. */
const STACK_GAP = 8;

export function ToasterHost() {
  const colorMode = useColorMode();
  const themeScope = useChromeThemeScope();
  const [actionsRef, { height: actionsHeight }] =
    useElementSize<HTMLDivElement>();

  // The strip is a reserved band, not an overlay: the stack's own bottom offset
  // grows by exactly what the strip measures, so the actions can never paint
  // over the front toast — and cost nothing (0px) while the strip is empty.
  // Measuring rather than hardcoding a height keeps the control's own density
  // tokens the single source of the reservation.
  const reserved = actionsHeight > 0 ? actionsHeight + STACK_GAP : 0;

  return (
    // Sonner renders its toast list inline (a fixed-position `<ol
    // data-sonner-toaster>`, not a React portal), so the `var(--popover)` /
    // `var(--border)` / `var(--radius)` in the style prop resolve from this
    // wrapper's theme scope. We wear the cross-app chrome scope: the focused
    // app's theme when a single app fills the surface (docked / solo), the
    // neutral global theme in desktop mode (no single app owns the chrome).
    //
    // `surface="none"` is the honest no-paint case the role exists for, not an
    // omission: everything under here is an overlay-level card (a toast, the
    // dismiss-all strip) that paints itself and is fixed-positioned out of this
    // wrapper's flow. A canvas here would be a full-width opaque band across the
    // page painting over the app.
    <Theme name={themeScope} surface="none">
      <Sonner
        theme={colorMode}
        className="toaster group"
        offset={{ bottom: VIEWPORT_OFFSET + reserved }}
        mobileOffset={{ bottom: VIEWPORT_OFFSET + reserved }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)",
          } as React.CSSProperties
        }
      />
      <div
        ref={actionsRef}
        // eslint-disable-next-line layout/no-adhoc-layout -- viewport-corner fixed strip, anchored to the same inset as sonner's own fixed toast list
        className="pointer-events-none fixed z-popover"
        style={{ right: VIEWPORT_OFFSET, bottom: VIEWPORT_OFFSET }}
      >
        <DismissAllButton />
      </div>
    </Theme>
  );
}
