import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useDarkMode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { ThemeRow } from "../internal/theme-rows";

const COLOR_BARS = [
  "primary",
  "secondary",
  "accent",
  "muted",
  "border",
  "card",
] as const;

/** The card's second line: where the theme comes from, and who uses it. */
function describe(row: ThemeRow): string {
  if (row.usedBy.length === 0) return row.source;
  return `${row.source} · ${row.usedBy.map((u) => u.label).join(", ")}`;
}

/**
 * The BODY of a theme's gallery card: a colour-bar preview panel over the
 * theme's name and a line saying where it comes from and which scopes use it.
 * The card itself — its chrome, its selected ring, its click/Enter activation,
 * its hover actions — belongs to the gallery's one `DataCard`, reached through
 * `viewOptions.gallery.renderBody`; selecting the theme is the surface's
 * `onRowActivate`. All this body owns is the preview, the text, and the dimmed
 * look while its own save is in flight.
 */
export function ThemeCard({
  row,
  isPending,
}: {
  row: ThemeRow;
  isPending: boolean;
}) {
  const dark = useDarkMode();
  const colors = dark ? row.preview.dark : row.preview.light;

  return (
    <Stack gap="sm" className={cn(isPending && "opacity-50")}>
      <Grid
        cols={COLOR_BARS.length}
        gap="xs"
        align="end"
        className="h-14 rounded-md px-sm py-sm"
        style={{ backgroundColor: colors.background }}
      >
        {COLOR_BARS.map((key) => (
          <div
            key={key}
            className="h-6 rounded-sm"
            style={{ backgroundColor: colors[key] }}
          />
        ))}
      </Grid>
      <Stack gap="none">
        {/* Each line is its own single-line container, so a long catalog
            name ellipsizes at the card edge instead of wrapping the card
            taller than its neighbours. */}
        <Line>
          <Text as="span" variant="label">
            {row.label}
          </Text>
        </Line>
        <Line>
          <Text as="span" variant="caption" tone="muted">
            {describe(row)}
          </Text>
        </Line>
      </Stack>
    </Stack>
  );
}
