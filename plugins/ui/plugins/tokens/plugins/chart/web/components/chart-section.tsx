import { useContext } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  ColorAdjustContext,
  transformValues,
} from "@plugins/ui/plugins/theme-engine/web";
import {
  TokenRow,
  TokenModeContext,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { chartGroup } from "../../shared";
import { chartConfig } from "../internal/config";
import { Chart } from "../slots";

export function ChartSection({ search }: { search: string }) {
  const config = useConfig(chartConfig) as {
    preset: string;
    overrides: { light: Record<string, string>; dark: Record<string, string> };
  };
  const setConfig = useSetConfig(chartConfig);
  const presets = Chart.Preset.useContributions();
  const adjustment = useContext(ColorAdjustContext);
  const tokenMode = useContext(TokenModeContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = config.overrides;
  const lightOverrides = Object.fromEntries(
    Object.entries(overrides.light).filter(([, v]) => v !== "")
  );
  const darkOverrides = Object.fromEntries(
    Object.entries(overrides.dark).filter(([, v]) => v !== "")
  );
  const lightValues = active
    ? transformValues(
        { ...active.light, ...lightOverrides },
        adjustment,
      )
    : {};
  const darkValues = active
    ? transformValues(
        { ...active.dark, ...darkOverrides },
        adjustment,
      )
    : {};
  const activeValues = tokenMode === "dark" ? darkValues : lightValues;
  const activeOverrideKeys = new Set(
    Object.keys(tokenMode === "dark" ? darkOverrides : lightOverrides),
  );

  const schema = chartGroup.schema;
  const vars = chartGroup.vars;
  const allKeys = Object.keys(schema) as (keyof typeof schema)[];

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
              className="size-2.5 rounded-full border border-border/50"
              style={{ backgroundColor: p.light["chart-1"] }}
            />
            {p.label}
          </button>
        ))}
      </div>

      {/* Flat list of chart tokens */}
      <div className="flex flex-col gap-0.5">
        {allKeys.map((key) => {
          const label = schema[key]?.label ?? key;
          const cssVar = vars[key] ?? `--${key}`;
          const value = activeValues[key] ?? schema[key]?.default ?? "";
          const isOverridden = activeOverrideKeys.has(key as string);
          const isSplit =
            overrides.light[key as string] !== overrides.dark[key as string] &&
            (overrides.light[key as string] !== "" ||
              overrides.dark[key as string] !== "");

          return (
            <TokenRow
              key={key as string}
              label={label}
              cssVar={cssVar}
              value={value}
              isOverridden={isOverridden}
              isSplit={isSplit}
              search={search}
              onValueChange={(newValue) => setOverride(key as string, newValue)}
              onReset={() => resetOverride(key as string)}
            />
          );
        })}
      </div>
    </div>
  );
}
