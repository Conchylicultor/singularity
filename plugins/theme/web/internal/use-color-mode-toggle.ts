import { useConfig, useSetConfig, useScopeForked } from "@plugins/config_v2/web";
import { useCurrentAppId } from "@plugins/apps/web";
import { themeEngineConfig } from "@plugins/ui/plugins/theme-engine/core";

/**
 * Shared light/dark toggle state. Resolves "system" to a concrete light/dark so
 * a single click always flips it. Edits target the BASE scope unless the
 * current app has been explicitly forked. Used by both the toolbar
 * `ThemeToggle` and the Settings sidebar `ThemeSidebarItem`.
 */
export function useColorModeToggle(): { dark: boolean; toggle: () => void } {
  const appId = useCurrentAppId();
  const forked = useScopeForked(appId ? `app:${appId}` : undefined);
  const scopeId = forked && appId ? `app:${appId}` : undefined;

  const { colorMode } = useConfig(themeEngineConfig, { scopeId }) as {
    colorMode: "light" | "dark" | "system";
  };
  const set = useSetConfig(themeEngineConfig, { scopeId });

  const dark =
    colorMode === "dark" ||
    (colorMode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return { dark, toggle: () => set("colorMode", dark ? "light" : "dark") };
}
