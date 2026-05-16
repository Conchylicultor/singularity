import { useContext } from "react";
import { useConfigValues, setConfigValue } from "@plugins/config/web";
import {
  ColorAdjustContext,
  transformValues,
} from "@plugins/ui/plugins/theme-engine/web";
import { TokenRow } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { chartGroup } from "../../shared";
import { chartConfig } from "../internal/config";
import { Chart } from "../slots";

const PLUGIN_ID = "ui-tokens-chart";

function setOverride(key: string, value: string, currentOverrides: string) {
  const current = JSON.parse(currentOverrides || "{}") as {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  if (!current.light) current.light = {};
  if (!current.dark) current.dark = {};
  current.light[key] = value;
  current.dark[key] = value;
  void setConfigValue(`${PLUGIN_ID}.overrides`, JSON.stringify(current));
}

function resetOverride(key: string, currentOverrides: string) {
  const current = JSON.parse(currentOverrides || "{}") as {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  if (current.light) delete current.light[key];
  if (current.dark) delete current.dark[key];
  void setConfigValue(`${PLUGIN_ID}.overrides`, JSON.stringify(current));
}

export function ChartSection({ search }: { search: string }) {
  const config = useConfigValues(chartConfig, PLUGIN_ID);
  const presets = Chart.Preset.useContributions();
  const adjustment = useContext(ColorAdjustContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = JSON.parse((config.overrides as string) || "{}") as {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  const lightValues = active
    ? transformValues(
        { ...active.light, ...(overrides.light ?? {}) },
        adjustment,
      )
    : {};
  const lightOverrideKeys = new Set(Object.keys(overrides.light ?? {}));

  const schema = chartGroup.schema;
  const vars = chartGroup.vars;
  const allKeys = Object.keys(schema) as (keyof typeof schema)[];

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
            onClick={() => void setConfigValue(`${PLUGIN_ID}.preset`, p.id)}
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
          const value = lightValues[key] ?? schema[key]?.default ?? "";
          const isOverridden = lightOverrideKeys.has(key as string);

          return (
            <TokenRow
              key={key as string}
              label={label}
              cssVar={cssVar}
              value={value}
              isOverridden={isOverridden}
              search={search}
              onValueChange={(newValue) =>
                setOverride(key as string, newValue, config.overrides as string)
              }
              onReset={() =>
                resetOverride(key as string, config.overrides as string)
              }
            />
          );
        })}
      </div>
    </div>
  );
}

