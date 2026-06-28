import { useEffect, useState } from "react";
import { useConfig } from "@plugins/config_v2/web";
import { useCurrentAppId } from "@plugins/apps-core/web";
import { themeEngineConfig } from "../core";

export type ColorMode = "light" | "dark";

// Resolves the effective light/dark mode for a given config scope, collapsing the
// `system` setting against the OS `prefers-color-scheme` (with a live listener).
// This is THE single resolution of color mode — both the global `.dark` class
// applier and prop-themed third-party components (sonner, charts, editors) consume
// it, so the class, the `color-scheme` property, and every JS widget agree.
export function useResolvedColorMode(scopeId?: string): ColorMode {
  const { colorMode } = useConfig(themeEngineConfig, { scopeId }) as {
    colorMode: "light" | "dark" | "system";
  };

  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    if (colorMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemDark(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [colorMode]);

  return colorMode === "dark" || (colorMode === "system" && systemDark)
    ? "dark"
    : "light";
}

// The resolved color mode for the active app — the same value driving the global
// `.dark` class. Use this to feed any component that themes itself via a prop
// (e.g. `<Sonner theme={useColorMode()} />`) instead of reading the class.
export function useColorMode(): ColorMode {
  const appId = useCurrentAppId();
  return useResolvedColorMode(appId ? `app:${appId}` : undefined);
}
