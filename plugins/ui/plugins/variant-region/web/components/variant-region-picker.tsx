import type { ComponentType } from "react";
import type { Slot } from "@plugins/framework/plugins/web-sdk/core";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import { cn } from "@/lib/utils";
import type { VariantRegionCore } from "../../core";
import type { VariantContribution } from "../slots";

/**
 * The settings picker rendered inside the theme-customizer. Unlike the live
 * `Region` host (which targets `app:<currentApp>`), the picker edits the
 * customizer's *editing* tier via `useThemeScopeId()` — exactly like the
 * token-group rows — so picker edits land in the same scope as palette edits.
 */
export function createPicker<Props>(
  core: VariantRegionCore<Props>,
  slot: Slot<VariantContribution<Props>>,
): ComponentType {
  function Picker() {
    const scopeId = useThemeScopeId();
    const variants = slot.useContributions();
    const { variant: activeId } = useConfig(core.config, { scopeId });
    const setConfig = useSetConfig(core.config, { scopeId });

    if (variants.length === 0) {
      return (
        <Text variant="body" tone="muted">
          No variants available
        </Text>
      );
    }

    return (
      <div className="flex gap-2">
        {variants.map((v) => (
          <button
            key={v.id}
            className={cn(
              "px-3 py-1 rounded-md border transition-colors",
              v.id === activeId
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50",
            )}
            onClick={() => setConfig("variant", v.id)}
          >
            <Text variant="label" tone={v.id === activeId ? "primary" : "muted"}>
              {v.label}
            </Text>
          </button>
        ))}
      </div>
    );
  }
  return Picker;
}
