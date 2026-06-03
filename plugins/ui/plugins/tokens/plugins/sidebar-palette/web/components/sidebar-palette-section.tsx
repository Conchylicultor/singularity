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
  useThemeScopeId,
} from "@plugins/ui/plugins/theme-engine/web";
import {
  TokenRow,
  TokenModeContext,
} from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { sidebarPaletteGroup } from "../../shared";
import { sidebarPaletteConfig } from "../internal/config";
import { SidebarPalette } from "../slots";

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

export function SidebarPaletteSection({ search }: { search: string }) {
  const scopeId = useThemeScopeId();
  const config = useConfig(sidebarPaletteConfig, { scopeId }) as {
    preset: string;
    overrides: { light: Record<string, string>; dark: Record<string, string> };
  };
  const setConfig = useSetConfig(sidebarPaletteConfig, { scopeId });
  const presets = SidebarPalette.Preset.useContributions();
  const adjustment = useContext(ColorAdjustContext);
  const tokenMode = useContext(TokenModeContext);

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = config.overrides;
  const activeOverrides = tokenMode === "dark" ? (overrides.dark ?? {}) : (overrides.light ?? {});
  const lightOverrideFiltered = Object.fromEntries(
    Object.entries(overrides.light ?? {}).filter(([, v]) => v !== ""),
  );
  const darkOverrideFiltered = Object.fromEntries(
    Object.entries(overrides.dark ?? {}).filter(([, v]) => v !== ""),
  );
  const lightValues = active
    ? transformValues(
        { ...active.light, ...lightOverrideFiltered },
        adjustment,
      )
    : {};
  const darkValues = active
    ? transformValues(
        { ...active.dark, ...darkOverrideFiltered },
        adjustment,
      )
    : {};
  const activeValues = tokenMode === "dark" ? darkValues : lightValues;
  const activeOverrideKeys = new Set(
    Object.entries(activeOverrides)
      .filter(([, v]) => v !== "")
      .map(([k]) => k),
  );

  const modeKey = tokenMode === "dark" ? "dark" : "light";

  const schema = sidebarPaletteGroup.schema;
  const vars = sidebarPaletteGroup.vars;

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
                  const lightVal = overrides.light?.[key as string];
                  const darkVal = overrides.dark?.[key as string];
                  const isSplit =
                    lightVal !== darkVal &&
                    (lightVal !== undefined || darkVal !== undefined) &&
                    (lightVal !== "" || darkVal !== "");

                  return (
                    <TokenRow
                      key={key as string}
                      label={label}
                      cssVar={cssVar}
                      value={value}
                      isOverridden={isOverridden}
                      isSplit={isSplit}
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
          );
        })}
      </div>
    </div>
  );
}

