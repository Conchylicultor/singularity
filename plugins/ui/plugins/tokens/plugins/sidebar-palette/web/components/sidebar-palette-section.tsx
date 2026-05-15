import { useContext } from "react";
import { useConfigValues, setConfigValue } from "@plugins/config/web";
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
import { TokenRow } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { sidebarPaletteGroup } from "../../shared";
import { sidebarPaletteConfig } from "../internal/config";
import { SidebarPalette } from "../slots";

const PLUGIN_ID = "ui-tokens-sidebar-palette";

interface GroupDef {
  label: string;
  keys: (keyof typeof sidebarPaletteGroup.schema)[];
}

const GROUPS: GroupDef[] = [
  { label: "Base", keys: ["sidebar", "sidebarForeground"] },
  { label: "Primary", keys: ["sidebarPrimary", "sidebarPrimaryForeground"] },
  { label: "Accent", keys: ["sidebarAccent", "sidebarAccentForeground"] },
  { label: "Border", keys: ["sidebarBorder", "sidebarRing"] },
];

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

export function SidebarPaletteSection({ search }: { search: string }) {
  const config = useConfigValues(sidebarPaletteConfig, PLUGIN_ID);
  const presets = SidebarPalette.Preset.useContributions();
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

  const schema = sidebarPaletteGroup.schema;
  const vars = sidebarPaletteGroup.vars;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Sidebar Palette</h3>
      </div>

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
              style={{ backgroundColor: p.light.sidebar }}
            />
            {p.label}
          </button>
        ))}
      </div>

      {/* Token groups */}
      <div className="flex flex-col gap-0.5">
        {GROUPS.map((group) => {
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
            <Collapsible key={group.label} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                <CollapsibleChevron className="size-3" />
                {group.label}
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-2">
                {visibleKeys.map((key) => {
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
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

