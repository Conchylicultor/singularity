import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useDarkMode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { CatalogTheme } from "../../shared";

const COLOR_BARS = [
  "primary",
  "secondary",
  "accent",
  "muted",
  "border",
  "card",
] as const;

function getColor(
  theme: CatalogTheme,
  key: string,
  dark: boolean,
): string | undefined {
  return dark ? theme.cssVars.dark[key] : theme.cssVars.light[key];
}

/**
 * The BODY of a theme's gallery card: a colour-bar preview panel over the
 * theme's name. The card itself — its chrome, its click/Enter activation, its
 * hover state — belongs to the gallery's one `DataCard`, reached through
 * `viewOptions.gallery.renderBody`; applying the theme is the surface's
 * `onRowActivate`. All this body owns is the preview, the name, and the dimmed
 * look while its own apply is in flight.
 */
export function CommunityThemeCard({
  theme,
  isPending,
}: {
  theme: CatalogTheme;
  isPending: boolean;
}) {
  const dark = useDarkMode();
  const bg = getColor(theme, "background", dark);
  const fg = getColor(theme, "foreground", dark);

  return (
    <Stack gap="md" className={cn(isPending && "opacity-50")}>
      <Grid
        cols={COLOR_BARS.length}
        gap="xs"
        align="end"
        className="h-16 rounded-md px-md py-md"
        style={{ backgroundColor: bg }}
      >
        {COLOR_BARS.map((key) => (
          <div
            key={key}
            className="h-8 rounded-sm"
            style={{ backgroundColor: getColor(theme, key, dark) }}
          />
        ))}
      </Grid>

      <Line className="gap-xs">
        <Fill>
          <Text as="span" variant="label" style={{ color: fg }}>
            {theme.name}
          </Text>
        </Fill>
        {theme.source === "registry" && (
          <span
            className={cn(
              rigidClass(),
              "rounded-full bg-primary/10 px-xs text-3xs uppercase tracking-wide text-primary",
            )}
          >
            curated
          </span>
        )}
      </Line>
    </Stack>
  );
}
