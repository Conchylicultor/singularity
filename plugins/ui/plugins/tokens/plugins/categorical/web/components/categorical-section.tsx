import { useContext } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import {
  ColorAdjustContext,
  transformValues,
  useThemeScopeId,
} from "@plugins/ui/plugins/theme-engine/web";
import {
  TokenRow,
  TokenModeContext,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { categoricalGroup } from "../../shared";
import { categoricalConfig } from "../internal/config";
import { Categorical } from "../slots";

export function CategoricalSection({ search }: { search: string }) {
  const scopeId = useThemeScopeId();
  const config = useConfig(categoricalConfig, { scopeId }) as {
    preset: string;
    overrides: { light: Record<string, string>; dark: Record<string, string> };
  };
  const setConfig = useSetConfig(categoricalConfig, { scopeId });
  const presets = Categorical.Preset.useContributions();
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

  const schema = categoricalGroup.schema;
  const vars = categoricalGroup.vars;
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
    <Stack gap="xs">
      {/* Preset picker */}
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off offset separating preset picker from the token list below */}
      <Stack direction="row" gap="xs" wrap className="mb-3">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`flex items-center gap-xs px-sm py-xs text-caption rounded-md border transition-colors ${
              p.id === config.preset
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
            onClick={() => setConfig("preset", p.id)}
          >
            <span
              className="size-2.5 rounded-full border border-border/50"
              style={{ backgroundColor: p.light["categorical-1"] }}
            />
            {p.label}
          </button>
        ))}
      </Stack>

      {/* Flat list of categorical tokens */}
      <Stack gap="2xs">
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
      </Stack>
    </Stack>
  );
}
