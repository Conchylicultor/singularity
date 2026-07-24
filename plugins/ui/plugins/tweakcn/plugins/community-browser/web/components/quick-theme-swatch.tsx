import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useDarkMode } from "@plugins/primitives/plugins/syntax-highlight/web";
import type { CatalogTheme } from "../../shared";

/** The four vars that read as a theme's identity at swatch size. */
const SWATCH_KEYS = ["primary", "secondary", "accent", "background"] as const;

/**
 * One catalog theme as a single-line pick target: a few identity dots plus the
 * name. The full-size `CommunityThemeCard` (a 64px preview panel) is the pane
 * gallery's shape; a popover needs a dozen of these above the fold, so the
 * preview collapses to dots instead of the card merely shrinking.
 */
export function QuickThemeSwatch({
  theme,
  isPending,
  onApply,
}: {
  theme: CatalogTheme;
  isPending: boolean;
  onApply: () => void;
}) {
  const dark = useDarkMode();
  const vars = dark ? theme.cssVars.dark : theme.cssVars.light;

  return (
    <Row
      size="sm"
      hover="muted"
      bordered
      disabled={isPending}
      onClick={onApply}
      title={theme.name}
      icon={
        <Stack as="span" direction="row" gap="2xs" align="center">
          {SWATCH_KEYS.map((key) => (
            <span
              key={key}
              className="size-2.5 rounded-full border border-border/60"
              style={{ backgroundColor: vars[key] }}
            />
          ))}
        </Stack>
      }
    >
      {/* A `<Text>` leaf inside the Row's line container, so a long catalog name
          ("APOTHEOSIS MINT MIDNIGHT") ellipsizes at the card edge instead of
          bleeding over the neighbouring swatch. */}
      <Text as="span" variant="caption">
        {theme.name}
      </Text>
    </Row>
  );
}
