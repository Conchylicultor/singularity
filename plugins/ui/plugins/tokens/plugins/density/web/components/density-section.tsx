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
import { densityGroup } from "../../shared";
import { densityConfig } from "../internal/config";
import { Density } from "../slots";

export function DensitySection({ search }: { search: string }) {
  const config = useConfig(densityConfig) as {
    preset: string;
    overrides: { light: Record<string, string>; dark: Record<string, string> };
  };
  const setConfig = useSetConfig(densityConfig);
  const presets = Density.Preset.useContributions();
  const tokenMode = useContext(TokenModeContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = config.overrides;
  const modeOverrides = tokenMode === "dark" ? overrides.dark : overrides.light;
  const activeValues: Record<string, string> = active
    ? {
        ...(tokenMode === "dark" ? active.dark : active.light),
        ...Object.fromEntries(
          Object.entries(modeOverrides).filter(([, v]) => v !== "")
        ),
      }
    : {};
  const activeOverrideKeys = new Set(
    Object.entries(modeOverrides)
      .filter(([, v]) => v !== "")
      .map(([k]) => k),
  );

  const schema = densityGroup.schema;
  const vars = densityGroup.vars;

  type DensityKey = keyof typeof schema;
  const allKeys = Object.keys(schema) as DensityKey[];

  const visibleKeys = allKeys.filter((key) => {
    const label = schema[key]?.label ?? (key as string);
    const cssVar = vars[key] ?? "";
    if (!search) return true;
    const q = search.toLowerCase();
    return label.toLowerCase().includes(q) || cssVar.toLowerCase().includes(q);
  });

  if (visibleKeys.length === 0) return null;

  const setOverride = (key: string, value: string) => {
    const newOverrides = { ...overrides };
    if (tokenMode === "both" || tokenMode === "light") {
      newOverrides.light = { ...newOverrides.light, [key]: value };
    }
    if (tokenMode === "both" || tokenMode === "dark") {
      newOverrides.dark = { ...newOverrides.dark, [key]: value };
    }
    setConfig("overrides", newOverrides);
  };

  const resetOverride = (key: string) => {
    const newOverrides = { ...overrides };
    if (tokenMode === "both" || tokenMode === "light") {
      newOverrides.light = { ...newOverrides.light, [key]: "" };
    }
    if (tokenMode === "both" || tokenMode === "dark") {
      newOverrides.dark = { ...newOverrides.dark, [key]: "" };
    }
    setConfig("overrides", newOverrides);
  };

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
              className="inline-flex border border-current rounded-sm bg-current/20"
              style={{ padding: `${p.light.padChipY} ${p.light.padChipX}` }}
            >
              <span className="size-1.5 rounded-full bg-current" />
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
                onValueChange={(newValue) => setOverride(key as string, newValue)}
                onReset={() => resetOverride(key as string)}
              />
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
