import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useRef, useState } from "react";
import { MdUndo } from "react-icons/md";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { Row, SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Color,
  ColorPickerPopover,
} from "@plugins/primitives/plugins/css/plugins/color-picker/web";
import type { ShadowParams } from "../../shared";
import { buildShadowTiers, shadowGroup, DEFAULT_SHADOW_PARAMS } from "../../shared";
import { useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import { shadowConfig } from "../internal/config";
import { Shadow } from "../slots";

type ShadowOverrides = {
  color: string;
  opacity: string;
  blur: string;
  spread: string;
  offsetX: string;
  offsetY: string;
};

const EMPTY_OVERRIDES: ShadowOverrides = {
  color: "",
  opacity: "",
  blur: "",
  spread: "",
  offsetX: "",
  offsetY: "",
};

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

function mergeParams(
  base: ShadowParams,
  overrides: ShadowOverrides,
): ShadowParams {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== "") {
      (merged as Record<string, unknown>)[key] =
        key === "opacity" ? parseFloat(value) : value;
    }
  }
  return merged;
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
  overrides,
  setConfig,
}: {
  paramKey: ParamKey;
  value: string | number;
  isOverridden: boolean;
  baseParams: ShadowParams;
  overrides: ShadowOverrides;
  setConfig: (key: "preset" | "overrides", value: unknown) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mirror the incoming value into the local draft unless the user is editing
  // (focus tracked as state — reading inputRef.current during render is a
  // react-hooks/refs violation). inputRef is still used by onKeyDown to blur.
  if (String(value) !== localValue && !focused) {
    setLocalValue(String(value));
  }

  const commit = () => {
    const newVal = paramKey === "opacity" ? parseFloat(localValue) : localValue;
    if (String(newVal) === String(baseParams[paramKey])) {
      setConfig("overrides", { ...overrides, [paramKey]: "" });
    } else {
      const stringValue = paramKey === "opacity" ? localValue : localValue;
      setConfig("overrides", { ...overrides, [paramKey]: stringValue });
    }
  };

  const handleReset = () => {
    setConfig("overrides", { ...overrides, [paramKey]: "" });
  };

  return (
    <div className="flex items-center gap-sm group">
      <input
        ref={inputRef}
        type="text"
        className="flex-1 text-caption font-mono bg-transparent border border-transparent rounded-md px-xs py-2xs focus:border-border focus:bg-background focus:outline-none"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
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
  const scopeId = useThemeScopeId();
  const config = useConfig(shadowConfig, { scopeId }) as {
    preset: string;
    overrides: ShadowOverrides;
  };
  const setConfig = useSetConfig(shadowConfig, { scopeId });
  const presets = Shadow.Preset.useContributions();

  const active = presets.find((p) => p.id === config.preset) ?? presets[0];
  const overrides = config.overrides;
  const baseParams: ShadowParams = (active as { params?: ShadowParams } | undefined)?.params ?? DEFAULT_SHADOW_PARAMS;
  const mergedParams = mergeParams(baseParams, overrides);
  const hasOverrides = Object.values(overrides).some((v) => v !== "");

  const tokens = hasOverrides ? buildShadowTiers(mergedParams) : (active?.light ?? buildShadowTiers(DEFAULT_SHADOW_PARAMS));

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
  const colorIsOverridden = overrides.color !== "";

  return (
    <Stack gap="xs">
      {/* Preset picker */}
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off offset separating preset picker from the parameter editor below */}
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
            onClick={() => {
              setConfig("preset", p.id);
              setConfig("overrides", EMPTY_OVERRIDES);
            }}
          >
            <Stack direction="row" align="center" gap="xs">
              <span
                className="size-5 rounded-sm bg-background border border-border"
                style={{ boxShadow: p.light.shadow }}
              />
              {p.label}
            </Stack>
          </button>
        ))}
      </Stack>

      {/* Parameters editor */}
      <Collapsible defaultOpen>
        <SectionHeaderRow variant="eyebrow">Parameters</SectionHeaderRow>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- indent + top offset on third-party CollapsibleContent; no padding/gap equivalent */}
        <CollapsibleContent className="ml-2 mt-1">
          <Stack gap="xs">
            {/* Color row */}
            <Row hover="muted" className="gap-sm">
              <Text as="span" variant="label" className="w-16 shrink-0">Color</Text>
              <div className="flex items-center gap-sm flex-1">
                <ColorPickerPopover
                  value={colorOklch}
                  onChange={(oklch) => {
                    const param = oklchToChannels(oklch);
                    if (!param) return;
                    if (param === baseParams.color) {
                      setConfig("overrides", { ...overrides, color: "" });
                    } else {
                      setConfig("overrides", { ...overrides, color: param });
                    }
                  }}
                />
                <Text as="span" variant="caption" className="font-mono text-muted-foreground">
                  {mergedParams.color}
                </Text>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfig("overrides", { ...overrides, color: "" });
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
            </Row>

            {/* Numeric/text param rows */}
            {PARAM_FIELDS.map(({ key, label }) => {
              const isOverridden = overrides[key] !== "";
              return (
                <Row key={key} hover="muted" className="gap-sm">
                  <Text as="span" variant="label" className="w-16 shrink-0">
                    {label}
                  </Text>
                  <ParamInput
                    paramKey={key}
                    value={mergedParams[key]}
                    isOverridden={isOverridden}
                    baseParams={baseParams}
                    overrides={overrides}
                    setConfig={setConfig}
                  />
                </Row>
              );
            })}

            {hasOverrides && (
              <Button
                variant="ghost"
                // eslint-disable-next-line spacing/no-adhoc-spacing, layout/no-adhoc-layout -- one-off top offset + self-start so this lone reset button keeps its natural width (left-aligned) in the column instead of stretching
                className="self-start mt-1 border border-border text-muted-foreground"
                onClick={() => setConfig("overrides", EMPTY_OVERRIDES)}
              >
                Reset all
              </Button>
            )}
          </Stack>
        </CollapsibleContent>
      </Collapsible>

      {/* Token previews */}
      <Collapsible>
        <SectionHeaderRow variant="eyebrow">Preview</SectionHeaderRow>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- indent + top offset on third-party CollapsibleContent; no padding/gap equivalent */}
        <CollapsibleContent className="ml-2 mt-1">
          <Cluster gap="md" className="p-sm">
            {allKeys.map((key) => {
              const label = schema[key]?.label ?? (key as string);
              const value = tokens[key] ?? "";
              return (
                <Stack key={key as string} align="center" gap="xs">
                  <span
                    className="size-8 rounded-md bg-background border border-border"
                    style={{ boxShadow: value }}
                  />
                  <span className="text-3xs text-muted-foreground text-center max-w-12">
                    {label.replace("Shadow ", "")}
                  </span>
                </Stack>
              );
            })}
          </Cluster>
        </CollapsibleContent>
      </Collapsible>
    </Stack>
  );
}
