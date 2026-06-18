import { MdLightMode, MdDarkMode } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useConfig, useSetConfig, useScopeMembership } from "@plugins/config_v2/web";
import { useCurrentAppId } from "@plugins/apps/web";
import { themeEngineConfig } from "@plugins/ui/plugins/theme-engine/core";

export function ThemeToggle() {
  const appId = useCurrentAppId();
  // Edits target BASE unless the current app has its own theme (membership).
  const forked = useScopeMembership(themeEngineConfig, appId ? `app:${appId}` : undefined);
  const scopeId = forked && appId ? `app:${appId}` : undefined;

  const { colorMode } = useConfig(themeEngineConfig, { scopeId }) as {
    colorMode: "light" | "dark" | "system";
  };
  const set = useSetConfig(themeEngineConfig, { scopeId });

  // Resolve "system" to a concrete light/dark so a single click flips it.
  const dark =
    colorMode === "dark" ||
    (colorMode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <IconButton
      icon={dark ? MdLightMode : MdDarkMode}
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => set("colorMode", dark ? "light" : "dark")}
    />
  );
}
