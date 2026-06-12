import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { shadowConfig } from "../internal/config";
import { Shadow } from "../slots";

export function ShadowPicker() {
  const presets = Shadow.Preset.useContributions();
  const { preset: activeId } = useConfig(shadowConfig);
  const setConfig = useSetConfig(shadowConfig);

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
          <span
            className="size-5 rounded-sm bg-background border border-border"
            style={{ boxShadow: p.light.shadow }}
          />
          {p.label}
        </button>
      ))}
    </Stack>
  );
}
