import { useContext } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  TokenRow,
  TokenModeContext,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { typographyGroup } from "../../shared";
import { typographyConfig } from "../internal/config";
import { Typography } from "../slots";

export function TypographySection({ search }: { search: string }) {
  const config = useConfig(typographyConfig) as {
    preset: string;
    overrides: { light: Record<string, string>; dark: Record<string, string> };
  };
  const setConfig = useSetConfig(typographyConfig);
  const presets = Typography.Preset.useContributions();
  const tokenMode = useContext(TokenModeContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = config.overrides;
  const activeValues: Record<string, string> = active
    ? {
        ...(tokenMode === "dark" ? active.dark : active.light),
        ...Object.fromEntries(
          Object.entries(
            tokenMode === "dark" ? (overrides.dark ?? {}) : (overrides.light ?? {}),
          ).filter(([, v]) => v !== ""),
        ),
      }
    : {};
  const activeOverrideKeys = new Set(
    Object.entries(
      tokenMode === "dark" ? (overrides.dark ?? {}) : (overrides.light ?? {}),
    )
      .filter(([, v]) => v !== "")
      .map(([k]) => k),
  );

  const modeKey = tokenMode === "dark" ? "dark" : "light";

  const schema = typographyGroup.schema;
  const vars = typographyGroup.vars;

  type TypographyKey = keyof typeof schema;
  const allKeys = Object.keys(schema) as TypographyKey[];

  // Filter tokens by search
  const visibleKeys = allKeys.filter((key) => {
    const label = schema[key]?.label ?? (key as string);
    const cssVar = vars[key] ?? "";
    if (!search) return true;
    const q = search.toLowerCase();
    return label.toLowerCase().includes(q) || cssVar.toLowerCase().includes(q);
  });

  if (visibleKeys.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {/* Preset picker */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors ${
              p.id === config.preset
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
            onClick={() => setConfig("preset", p.id)}
          >
            <span
              className="text-xs font-medium"
              style={{ fontFamily: p.light.fontSans }}
            >
              Aa
            </span>
            {p.label}
          </button>
        ))}
      </div>

      {/* Token rows */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider font-medium">
          <CollapsibleChevron className="size-3" />
          Tokens
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-2">
          {visibleKeys.map((key) => {
            const label = schema[key]?.label ?? (key as string);
            const cssVar = vars[key] ?? `--${key as string}`;
            const value =
              activeValues[key as string] ??
              schema[key]?.default ??
              "";
            const isOverridden = activeOverrideKeys.has(key as string);

            return (
              <TokenRow
                key={key as string}
                label={label}
                cssVar={cssVar}
                value={value}
                isOverridden={isOverridden}
                search={search}
                onValueChange={(newValue) => {
                  const newLight =
                    tokenMode === "both" || tokenMode === "light"
                      ? { ...overrides.light, [key as string]: newValue }
                      : overrides.light;
                  const newDark =
                    tokenMode === "both" || tokenMode === "dark"
                      ? { ...overrides.dark, [key as string]: newValue }
                      : overrides.dark;
                  setConfig("overrides", { light: newLight, dark: newDark });
                }}
                onReset={() =>
                  setConfig("overrides", {
                    ...overrides,
                    [modeKey]: { ...overrides[modeKey], [key as string]: "" },
                  })
                }
              />
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
