import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { typeScaleConfig } from "../internal/config";
import { TypeScale } from "../slots";

export function TypeScalePicker() {
  const presets = TypeScale.Preset.useContributions();
  const { preset: activeId } = useConfig(typeScaleConfig) as { preset: string };
  const setConfig = useSetConfig(typeScaleConfig);

  if (presets.length === 0) {
    return (
      <Text as="span" variant="body" className="text-muted-foreground">
        No presets available
      </Text>
    );
  }

  return (
    <div className="flex gap-2">
      {presets.map((p) => (
        <button
          key={p.id}
          className={`flex items-center gap-2 px-3 py-1.5 text-body rounded-md border transition-colors ${
            p.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("preset", p.id)}
        >
          <span style={{ fontSize: p.light.fontSizeBody, lineHeight: 1 }}>
            Aa
          </span>
          {p.label}
        </button>
      ))}
    </div>
  );
}
