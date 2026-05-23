import { useRef, useState } from "react";
import { MdUndo } from "react-icons/md";
import { useConfigValues, setConfigValue } from "@plugins/config/web";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  Color,
  ColorPickerPopover,
} from "@plugins/primitives/plugins/color-picker/web";
import type { ShadowParams } from "../../shared";
import { buildShadowTiers, shadowGroup } from "../../shared";
import { shadowConfig } from "../internal/config";
import { Shadow } from "../slots";

const PLUGIN_ID = "ui-tokens-shadow";

const DEFAULT_PARAMS: ShadowParams = {
  color: "0 0 0",
  opacity: 0.1,
  blur: "3px",
  spread: "0px",
  offsetX: "0",
  offsetY: "1px",
};

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value) || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function channelsToOklch(channels: string): string {
  return `oklch(${channels})`;
}

function oklchToChannels(oklchCss: string): string | null {
  const color = Color.fromCss(oklchCss);
  if (!color) return null;
  const l = Math.round(color.l * 1000) / 1000;
  const c = Math.round(color.c * 1000) / 1000;
  const h = Math.round(color.h * 10) / 10;
  return `${l} ${c} ${h}`;
}

function getActiveParams(
  active: { params?: ShadowParams } | undefined,
  storedParams: unknown,
): ShadowParams {
  const base: ShadowParams = active?.params ?? DEFAULT_PARAMS;
  const partial = parseJson(storedParams) as Partial<ShadowParams>;
  return { ...base, ...partial };
}

function writeParams(partial: Partial<ShadowParams>, base: ShadowParams) {
  const merged = { ...base, ...partial };
  const tokens = buildShadowTiers(merged);
  void setConfigValue(`${PLUGIN_ID}.params`, JSON.stringify(partial));
  void setConfigValue(
    `${PLUGIN_ID}.overrides`,
    JSON.stringify({ light: tokens, dark: tokens }),
  );
}

function resetParams() {
  void setConfigValue(`${PLUGIN_ID}.params`, "{}");
  void setConfigValue(`${PLUGIN_ID}.overrides`, "{}");
}

type ParamKey = keyof ShadowParams;

const PARAM_FIELDS: { key: ParamKey; label: string; type: "text" | "number" }[] = [
  { key: "opacity", label: "Opacity", type: "number" },
  { key: "blur", label: "Blur", type: "text" },
  { key: "spread", label: "Spread", type: "text" },
  { key: "offsetX", label: "Offset X", type: "text" },
  { key: "offsetY", label: "Offset Y", type: "text" },
];

function ParamInput({
  paramKey,
  value,
  isOverridden,
  baseParams,
  storedPartial,
}: {
  paramKey: ParamKey;
  value: string | number;
  isOverridden: boolean;
  baseParams: ShadowParams;
  storedPartial: Partial<ShadowParams>;
}) {
  const [localValue, setLocalValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  if (String(value) !== localValue && document.activeElement !== inputRef.current) {
    setLocalValue(String(value));
  }

  const commit = () => {
    const newVal = paramKey === "opacity" ? parseFloat(localValue) : localValue;
    if (String(newVal) === String(baseParams[paramKey])) {
      const next = { ...storedPartial };
      delete next[paramKey];
      writeParams(next, baseParams);
    } else {
      writeParams({ ...storedPartial, [paramKey]: newVal }, baseParams);
    }
  };

  const handleReset = () => {
    const next = { ...storedPartial };
    delete next[paramKey];
    writeParams(next, baseParams);
  };

  return (
    <div className="flex items-center gap-2 group">
      <input
        ref={inputRef}
        type="text"
        className="flex-1 text-xs font-mono bg-transparent border border-transparent rounded px-1.5 py-0.5 focus:border-border focus:bg-background focus:outline-none"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.blur(); }}
      />
      <button
        type="button"
        onClick={handleReset}
        title="Reset to preset value"
        className={`shrink-0 text-muted-foreground hover:text-foreground transition-opacity ${
          isOverridden
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-30 pointer-events-none"
        }`}
        aria-hidden={!isOverridden}
      >
        <MdUndo size={14} />
      </button>
    </div>
  );
}

export function ShadowSection({ search }: { search: string }) {
  const config = useConfigValues(shadowConfig, PLUGIN_ID);
  const presets = Shadow.Preset.useContributions();

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const storedPartial = parseJson(config.params) as Partial<ShadowParams>;
  const baseParams: ShadowParams = active?.params ?? DEFAULT_PARAMS;
  const mergedParams = getActiveParams(active, config.params);
  const hasOverrides = Object.keys(storedPartial).length > 0;

  const tokens = hasOverrides ? buildShadowTiers(mergedParams) : (active?.light ?? buildShadowTiers(DEFAULT_PARAMS));

  const schema = shadowGroup.schema;
  type ShadowKey = keyof typeof schema;
  const allKeys = Object.keys(schema) as ShadowKey[];

  const paramLabels = ["color", "opacity", "blur", "spread", "offset"];
  const matchesSearch = (q: string) => {
    return (
      allKeys.some((key) => {
        const label = schema[key]?.label ?? (key as string);
        const cssVar = shadowGroup.vars[key] ?? "";
        return label.toLowerCase().includes(q) || cssVar.toLowerCase().includes(q);
      }) ||
      paramLabels.some((l) => l.includes(q)) ||
      "shadow".includes(q)
    );
  };

  if (search && !matchesSearch(search.toLowerCase())) return null;

  const colorOklch = channelsToOklch(mergedParams.color);
  const colorIsOverridden = "color" in storedPartial;

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
            onClick={() => {
              void setConfigValue(`${PLUGIN_ID}.preset`, p.id);
              resetParams();
            }}
          >
            <span
              className="size-5 rounded-sm bg-background border border-border"
              style={{ boxShadow: p.light.shadow }}
            />
            {p.label}
          </button>
        ))}
      </div>

      {/* Parameters editor */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider font-medium">
          <CollapsibleChevron className="size-3" />
          Parameters
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-2 mt-1">
          <div className="flex flex-col gap-1.5">
            {/* Color row */}
            <div className="flex items-center gap-2 py-0.5 px-2 rounded-md hover:bg-muted/50 group">
              <span className="text-xs font-medium w-16 shrink-0">Color</span>
              <div className="flex items-center gap-2 flex-1">
                <ColorPickerPopover
                  value={colorOklch}
                  onChange={(oklch) => {
                    const param = oklchToChannels(oklch);
                    if (!param) return;
                    if (param === baseParams.color) {
                      const next = { ...storedPartial };
                      delete next.color;
                      writeParams(next, baseParams);
                    } else {
                      writeParams({ ...storedPartial, color: param }, baseParams);
                    }
                  }}
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {mergedParams.color}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = { ...storedPartial };
                  delete next.color;
                  writeParams(next, baseParams);
                }}
                title="Reset to preset value"
                className={`shrink-0 text-muted-foreground hover:text-foreground transition-opacity ${
                  colorIsOverridden
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-30 pointer-events-none"
                }`}
                aria-hidden={!colorIsOverridden}
              >
                <MdUndo size={14} />
              </button>
            </div>

            {/* Numeric/text param rows */}
            {PARAM_FIELDS.map(({ key, label }) => {
              const isOverridden = key in storedPartial;
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 py-0.5 px-2 rounded-md hover:bg-muted/50"
                >
                  <span className="text-xs font-medium w-16 shrink-0">
                    {label}
                  </span>
                  <ParamInput
                    paramKey={key}
                    value={mergedParams[key]}
                    isOverridden={isOverridden}
                    baseParams={baseParams}
                    storedPartial={storedPartial}
                  />
                </div>
              );
            })}

            {hasOverrides && (
              <button
                type="button"
                className="self-start mt-1 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-muted/50 transition-colors"
                onClick={resetParams}
              >
                Reset all
              </button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Token previews */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider font-medium">
          <CollapsibleChevron className="size-3" />
          Preview
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-2 mt-1">
          <div className="flex flex-wrap gap-3 p-2">
            {allKeys.map((key) => {
              const label = schema[key]?.label ?? (key as string);
              const value = tokens[key] ?? "";
              return (
                <div
                  key={key as string}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className="size-8 rounded bg-background border border-border"
                    style={{ boxShadow: value }}
                  />
                  <span className="text-[10px] text-muted-foreground text-center max-w-12 leading-tight">
                    {label.replace("Shadow ", "")}
                  </span>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
