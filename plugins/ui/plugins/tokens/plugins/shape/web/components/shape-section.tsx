import { useContext } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  TokenRow,
  TokenModeContext,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import { shapeGroup } from "../../shared";
import { shapeConfig } from "../internal/config";
import { Shape } from "../slots";

export function ShapeSection({ search }: { search: string }) {
  const scopeId = useThemeScopeId();
  const config = useConfig(shapeConfig, { scopeId }) as {
    preset: string;
    overrides: { light: Record<string, string>; dark: Record<string, string> };
  };
  const setConfig = useSetConfig(shapeConfig, { scopeId });
  const presets = Shape.Preset.useContributions();
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

  const schema = shapeGroup.schema;
  const vars = shapeGroup.vars;

  type ShapeKey = keyof typeof schema;
  const allKeys = Object.keys(schema) as ShapeKey[];

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
    <Stack gap="xs">
      {/* Preset picker */}
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off offset separating preset picker from the token rows below */}
      <Stack direction="row" gap="xs" wrap className="mb-3">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`px-sm py-xs text-caption rounded-md border transition-colors ${
              p.id === config.preset
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
            onClick={() => setConfig("preset", p.id)}
          >
            <Stack direction="row" align="center" gap="xs">
              <span
                className="size-3 border border-current"
                style={{ borderRadius: p.light.radius }}
              />
              {p.label}
            </Stack>
          </button>
        ))}
      </Stack>

      {/* Token rows */}
      <Collapsible defaultOpen>
        <SectionHeaderRow variant="eyebrow">Tokens</SectionHeaderRow>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- indent offset on third-party CollapsibleContent; no padding/gap equivalent */}
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
    </Stack>
  );
}
