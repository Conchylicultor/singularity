import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { fontFamilyConfig } from "../internal/config";
import { FontFamily } from "../slots";

export function FontFamilyPicker() {
  const presets = FontFamily.Preset.useContributions();
  const { preset: activeId } = useConfig(fontFamilyConfig) as { preset: string };
  const setConfig = useSetConfig(fontFamilyConfig);

  if (presets.length === 0) {
    return (
      <Text as="span" variant="body" className="text-muted-foreground">
        No presets available
      </Text>
    );
  }

  return (
    <Stack direction="row" gap="sm">
      {presets.map((p) => (
        <button
          key={p.id}
          className={`flex items-center gap-sm px-md py-xs text-body rounded-md border transition-colors ${
            p.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("preset", p.id)}
        >
          <span className="text-caption" style={{ fontFamily: p.light.fontSans }}>
            Aa
          </span>
          {p.label}
        </button>
      ))}
    </Stack>
  );
}
