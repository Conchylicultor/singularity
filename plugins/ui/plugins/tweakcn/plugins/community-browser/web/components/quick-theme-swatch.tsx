import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useDarkMode } from "@plugins/primitives/plugins/syntax-highlight/web";
import type { CatalogTheme } from "../../shared";

/** The four vars that read as a theme's identity at swatch size. */
const SWATCH_KEYS = ["primary", "secondary", "accent", "background"] as const;

/**
 * The BODY of one catalog theme in the quick picker: a few identity dots plus
 * the name, on one line. The card around it — chrome, click, hover, the `sm`
 * density — is the gallery's own `DataCard`, and applying the theme is the
 * surface's `onRowActivate`.
 *
 * The full-size `CommunityThemeCard` (a 64px preview panel) is the pane
 * gallery's shape; a popover needs a dozen of these above the fold, so the
 * preview collapses to dots instead of the card merely shrinking.
 */
export function QuickThemeSwatch({
  theme,
  isPending,
}: {
  theme: CatalogTheme;
  isPending: boolean;
}) {
  const dark = useDarkMode();
  const vars = dark ? theme.cssVars.dark : theme.cssVars.light;

  return (
    <Line className={cn("gap-sm", isPending && "opacity-50")} title={theme.name}>
      <Stack as="span" direction="row" gap="2xs" align="center">
        {SWATCH_KEYS.map((key) => (
          <span
            key={key}
            className="size-2.5 rounded-full border border-border/60"
            style={{ backgroundColor: vars[key] }}
          />
        ))}
      </Stack>
      {/* A `<Text>` leaf in the ONE flexible cell of the line, so a long catalog
          name ("APOTHEOSIS MINT MIDNIGHT") ellipsizes at the card edge instead
          of bleeding over the neighbouring swatch. */}
      <Fill>
        <Text as="span" variant="caption">
          {theme.name}
        </Text>
      </Fill>
    </Line>
  );
}
