import { Toaster as Sonner } from "sonner";
import { useColorMode } from "@plugins/ui/plugins/theme-engine/web";
import { useChromeThemeScope } from "@plugins/apps-core/plugins/theme-scope/web";

export function ToasterHost() {
  const colorMode = useColorMode();
  const themeScope = useChromeThemeScope();

  return (
    // Sonner renders its toast list inline (a fixed-position `<ol
    // data-sonner-toaster>`, not a React portal), so the `var(--popover)` /
    // `var(--border)` / `var(--radius)` in the style prop resolve from this
    // wrapper's theme scope. We wear the cross-app chrome scope: the focused
    // app's theme when a single app fills the surface (docked / solo), the
    // neutral global theme in desktop mode (no single app owns the chrome).
    <div data-theme-scope={themeScope}>
      <Sonner
        theme={colorMode}
        className="toaster group"
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)",
          } as React.CSSProperties
        }
      />
    </div>
  );
}
