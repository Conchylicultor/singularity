import { useContext } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/row/web";
import {
  TokenRow,
  TokenModeContext,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import { typeScaleGroup } from "../../shared";
import { typeScaleConfig } from "../internal/config";
import { TypeScale } from "../slots";

export function TypeScaleSection({ search }: { search: string }) {
  const scopeId = useThemeScopeId();
  const config = useConfig(typeScaleConfig, { scopeId }) as {
    preset: string;
    overrides: { light: Record<string, string>; dark: Record<string, string> };
  };
  const setConfig = useSetConfig(typeScaleConfig, { scopeId });
  const presets = TypeScale.Preset.useContributions();
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

  const schema = typeScaleGroup.schema;
  const vars = typeScaleGroup.vars;

  type TypeScaleKey = keyof typeof schema;
  const allKeys = Object.keys(schema) as TypeScaleKey[];

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
            className={`flex items-center gap-1.5 px-2.5 py-1 text-caption rounded-md border transition-colors ${
              p.id === config.preset
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
            onClick={() => setConfig("preset", p.id)}
          >
            <span
              className="font-medium"
              style={{ fontSize: p.light.fontSizeBody, lineHeight: 1 }}
            >
              Aa
            </span>
            {p.label}
          </button>
        ))}
      </div>

      {/* Token rows */}
      <Collapsible defaultOpen>
        <SectionHeaderRow variant="eyebrow">Tokens</SectionHeaderRow>
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
