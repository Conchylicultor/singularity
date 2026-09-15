import { both, defineFixedTheme } from "@plugins/ui/plugins/theme-engine/core";
import { fixedThemeScope } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { colorPaletteGroup } from "@plugins/ui/plugins/tokens/plugins/color-palette/core";
import { sidebarPaletteGroup } from "@plugins/ui/plugins/tokens/plugins/sidebar-palette/core";
import { densityGroup } from "@plugins/ui/plugins/tokens/plugins/density/core";
import { typeScaleGroup } from "@plugins/ui/plugins/tokens/plugins/type-scale/core";
import { fontFamilyGroup } from "@plugins/ui/plugins/tokens/plugins/font-family/core";

// The graphite tone: a neutral, faintly cool near-black that hosts light and
// dark apps alike. The chrome owns no accent colour of its own — the only
// accent on screen belongs to the app in the surface — so every tone below is
// grey except the status colours.
const GROUND = "oklch(0.2303 0.0083 264.40)"; // the rail and the tab bar
const PANEL = "oklch(0.2718 0.0102 260.70)"; // a popover opened from them
const TEXT = "oklch(0.8910 0.0059 264.53)";
const DIM = "oklch(0.6493 0.0128 264.48)"; // idle icons, inactive tabs
const HAIRLINE = "oklch(0.3126 0.0115 264.39)";
const HOVER = "oklch(0.2882 0.0062 258.36)"; // 6% white over the ground
const ACTIVE = "oklch(0.3321 0.0060 258.35)"; // 11% white over the ground
const SIGNAL = "oklch(0.7005 0.1387 252.57)"; // the build spinner, Reload
const ALERT = "oklch(0.6256 0.1933 23.03)"; // badges, a failed build
const OK = "oklch(0.7278 0.1698 151.06)"; // the health dot
const INK = "oklch(0.2303 0.0083 264.40)"; // text on a signal/ok fill

/**
 * The app chrome's theme — the rail, the tab strip, the action bar and the
 * toasts, plus every popover opened from them. A fixed theme: it is the same
 * whichever app is focused and whether the page is light or dark, so an app
 * with its own look is framed by the same neutral frame as every other one.
 *
 * Beyond colours it names only what makes it read as quiet chrome: its two
 * heights, lighter control labels (12.5px, regular — a tab's title and a
 * button's label alike) and font smoothing that draws light text at the font's
 * own weight. The font, the rest of the type scale, radii and spacing are the
 * defaults every app uses, so the chrome is set in the same face as the apps
 * it hosts.
 */
export const chromeTheme = defineFixedTheme({
  id: "chrome",
  label: "Chrome",
  scheme: "dark",
  fragments: [
    colorPaletteGroup.fragment(
      both({
        background: GROUND,
        foreground: TEXT,
        card: PANEL,
        cardForeground: TEXT,
        popover: PANEL,
        popoverForeground: TEXT,
        secondary: ACTIVE,
        secondaryForeground: TEXT,
        muted: HOVER,
        mutedForeground: DIM,
        accent: ACTIVE,
        accentForeground: TEXT,
        destructive: ALERT,
        destructiveForeground: "oklch(1 0 0)",
        success: OK,
        successForeground: INK,
        info: SIGNAL,
        infoForeground: INK,
        border: HAIRLINE,
        input: HAIRLINE,
        ring: SIGNAL,
      }),
    ),
    sidebarPaletteGroup.fragment(
      both({
        sidebar: GROUND,
        sidebarForeground: TEXT,
        sidebarBorder: HAIRLINE,
        // The hover step — a ghost control on the chrome hovers to this
        // (the chrome surface publishes it as `--hover-fill`). The selected
        // app and tab sit one step further, on `accent`.
        sidebarAccent: HOVER,
        sidebarAccentForeground: TEXT,
      }),
    ),
    densityGroup.fragment(
      both({
        // A 36px bar holding 26px controls.
        chromeBarH: "2.25rem",
        controlHeightSm: "1.625rem",
      }),
    ),
    typeScaleGroup.fragment(
      both({
        fontSizeControl: "0.78125rem",
        fontWeightControl: "400",
      }),
    ),
    fontFamilyGroup.fragment(both({ fontSmoothing: "antialiased" })),
  ],
});

/** The scope token every chrome surface wears: `<Theme name={chromeThemeScope}>`. */
export const chromeThemeScope = fixedThemeScope(chromeTheme);
