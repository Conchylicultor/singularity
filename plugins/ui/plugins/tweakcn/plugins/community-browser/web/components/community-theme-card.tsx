import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useDarkMode } from "@plugins/primitives/plugins/syntax-highlight/web";
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

  return (
    <button
      type="button"
      onClick={onApply}
      disabled={isPending}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border text-left transition-all",
        "hover:ring-1 hover:ring-primary/40 hover:shadow-sm",
        isPending && "opacity-50 cursor-wait",
      )}
    >
      <div
        className="flex items-end justify-center gap-xs px-md py-md h-16"
        style={{ backgroundColor: bg }}
      >
        {COLOR_BARS.map((key) => (
          <div
            key={key}
            className="flex-1 h-8 rounded-sm"
            style={{ backgroundColor: getColor(theme, key, dark) }}
          />
        ))}
      </div>

      <div className="flex items-center gap-xs border-t border-border px-sm py-xs">
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
    </button>
  );
}
