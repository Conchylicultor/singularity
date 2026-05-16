import { useConfigValues, setConfigValue } from "@plugins/config/web";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { TokenRow } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { shapeGroup } from "../../shared";
import { shapeConfig } from "../internal/config";
import { Shape } from "../slots";

const PLUGIN_ID = "ui-tokens-shape";

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

export function ShapeSection({ search }: { search: string }) {
  const config = useConfigValues(shapeConfig, PLUGIN_ID);
  const presets = Shape.Preset.useContributions();

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = JSON.parse((config.overrides as string) || "{}") as {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  const lightValues: Record<string, string> = active
    ? { ...active.light, ...(overrides.light ?? {}) }
    : {};
  const lightOverrideKeys = new Set(Object.keys(overrides.light ?? {}));

  const schema = shapeGroup.schema;
  const vars = shapeGroup.vars;

  type ShapeKey = keyof typeof schema;
  const allKeys = Object.keys(schema) as ShapeKey[];

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
            onClick={() => void setConfigValue(`${PLUGIN_ID}.preset`, p.id)}
          >
            <span
              className="size-3 border border-current"
              style={{ borderRadius: p.light.radius }}
            />
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
              lightValues[key as string] ??
              schema[key]?.default ??
              "";
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
                  setOverride(
                    key as string,
                    newValue,
                    config.overrides as string,
                  )
                }
                onReset={() =>
                  resetOverride(key as string, config.overrides as string)
                }
              />
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
