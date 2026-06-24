import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { TabBarSlots } from "@plugins/ui/plugins/tab-bar/web";
import { tabBarConfig } from "@plugins/ui/plugins/tab-bar/core";

/** Theme-customizer row for the tab-bar variant (chip / underline / connected). */
export function VariantPicker() {
  const variants = TabBarSlots.Variant.useContributions();
  const { variant: activeId } = useConfig(tabBarConfig);
  const setConfig = useSetConfig(tabBarConfig);

  if (variants.length === 0) {
    return (
      <Text as="span" variant="body" className="text-muted-foreground">
        No variants available
      </Text>
    );
  }

  return (
    <Stack direction="row" gap="sm">
      {variants.map((v) => (
        <button
          key={v.id}
          className={`px-md py-xs text-body rounded-md border transition-colors ${
            v.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("variant", v.id)}
        >
          {v.label}
        </button>
      ))}
    </Stack>
  );
}
