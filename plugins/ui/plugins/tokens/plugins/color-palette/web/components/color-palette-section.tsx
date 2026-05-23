import { useContext } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  ColorAdjustContext,
  transformValues,
} from "@plugins/ui/plugins/theme-engine/web";
import {
  TokenRow,
  TokenModeContext,
  type TokenMode,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { colorPaletteGroup } from "../../shared";
import { colorPaletteConfig } from "../internal/config";
import { ColorPalette } from "../slots";

interface GroupDef {
  label: string;
  keys: (keyof typeof colorPaletteGroup.schema)[];
}

const GROUPS: GroupDef[] = [
  { label: "Primary", keys: ["primary", "primaryForeground"] },
  { label: "Secondary", keys: ["secondary", "secondaryForeground"] },
  { label: "Accent", keys: ["accent", "accentForeground"] },
  { label: "Base", keys: ["background", "foreground"] },
  { label: "Card", keys: ["card", "cardForeground"] },
  { label: "Popover", keys: ["popover", "popoverForeground"] },
  { label: "Muted", keys: ["muted", "mutedForeground"] },
  { label: "Destructive", keys: ["destructive", "destructiveForeground"] },
  { label: "Border & Input", keys: ["border", "input", "ring"] },
];

export function ColorPaletteSection({ search }: { search: string }) {
  const config = useConfig(colorPaletteConfig);
  const setConfig = useSetConfig(colorPaletteConfig);
  const presets = ColorPalette.Preset.useContributions();
  const adjustment = useContext(ColorAdjustContext);
  const tokenMode = useContext(TokenModeContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = config.overrides as {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  const lightOverrides = Object.fromEntries(
    Object.entries(overrides.light).filter(([, v]) => v !== ""),
  );
  const darkOverrides = Object.fromEntries(
    Object.entries(overrides.dark).filter(([, v]) => v !== ""),
  );
  const lightValues = active
    ? transformValues({ ...active.light, ...lightOverrides }, adjustment)
    : {};
  const darkValues = active
    ? transformValues({ ...active.dark, ...darkOverrides }, adjustment)
    : {};
  const activeValues = tokenMode === "dark" ? darkValues : lightValues;
  const activeOverrideKeys = new Set(
    Object.keys(tokenMode === "dark" ? darkOverrides : lightOverrides),
  );

  const schema = colorPaletteGroup.schema;
  const vars = colorPaletteGroup.vars;

  function setOverride(key: string, value: string, mode: TokenMode) {
    const newOverrides = {
      light: { ...overrides.light },
      dark: { ...overrides.dark },
    };
    if (mode === "both" || mode === "light") {
      newOverrides.light[key] = value;
    }
    if (mode === "both" || mode === "dark") {
      newOverrides.dark[key] = value;
    }
    setConfig("overrides", newOverrides);
  }

  function resetOverride(key: string, mode: TokenMode) {
    const newOverrides = {
      light: { ...overrides.light },
      dark: { ...overrides.dark },
    };
    if (mode === "both" || mode === "light") {
      newOverrides.light[key] = "";
    }
    if (mode === "both" || mode === "dark") {
      newOverrides.dark[key] = "";
    }
    setConfig("overrides", newOverrides);
  }

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
              style={{ backgroundColor: p.light.primary }}
            />
            {p.label}
          </button>
        ))}
      </div>

      {/* Token groups */}
      <div className="flex flex-col gap-0.5">
        {GROUPS.map((group) => {
          // Filter tokens by search
          const visibleKeys = group.keys.filter((key) => {
            const label = schema[key]?.label ?? key;
            const cssVar = vars[key] ?? "";
            if (!search) return true;
            const q = search.toLowerCase();
            return (
              label.toLowerCase().includes(q) || cssVar.toLowerCase().includes(q)
            );
          });
          if (visibleKeys.length === 0) return null;

          return (
            <Collapsible key={group.label}>
              <CollapsibleTrigger className="flex w-full items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                <CollapsibleChevron className="size-3" />
                {group.label}
                <span className="ml-auto flex items-center gap-0.5">
                  {group.keys.map((key) => (
                    <span
                      key={key as string}
                      className="size-2 rounded-full border border-border/30"
                      style={{
                        backgroundColor:
                          activeValues[key] ?? schema[key]?.default ?? "",
                      }}
                    />
                  ))}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-2">
                {visibleKeys.map((key) => {
                  const label = schema[key]?.label ?? key;
                  const cssVar = vars[key] ?? `--${key}`;
                  const value = activeValues[key] ?? schema[key]?.default ?? "";
                  const isOverridden = activeOverrideKeys.has(key as string);
                  const isSplit =
                    overrides.light[key as string] !==
                      overrides.dark[key as string] &&
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
                      onValueChange={(newValue) =>
                        setOverride(key as string, newValue, tokenMode)
                      }
                      onReset={() => resetOverride(key as string, tokenMode)}
                    />
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

