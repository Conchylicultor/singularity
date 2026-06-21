import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useDarkMode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
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
 * A single theme preview in the community gallery. Built on the shared `<Card>`
 * primitive (a block `<div>` that fills its grid cell) so it sizes identically to
 * every other gallery card — mirroring Sonata's SongCard. A raw `<button>` here
 * would shrink-wrap to its content (form controls are fit-content), leaving each
 * card a different width.
 */
export function CommunityThemeCard({
  theme,
  isPending,
  onApply,
}: {
  theme: CatalogTheme;
  isPending: boolean;
  onApply: () => void;
}) {
  const dark = useDarkMode();
  const bg = getColor(theme, "background", dark);
  const fg = getColor(theme, "foreground", dark);

  const activate = () => {
    if (!isPending) onApply();
  };

  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      aria-disabled={isPending}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      className={cn(
        "rounded-lg p-lg",
        isPending && "cursor-wait opacity-50",
      )}
    >
      <Stack gap="md">
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

        <div className="flex items-center gap-xs">
          <Text
            as="span"
            variant="label"
            className="flex-1 truncate"
            style={{ color: fg }}
          >
            {theme.name}
          </Text>
          {theme.source === "registry" && (
            <span className="shrink-0 rounded-full bg-primary/10 px-xs text-3xs uppercase tracking-wide text-primary">
              curated
            </span>
          )}
        </div>
      </Stack>
    </Card>
  );
}
