import { useEffect, useState } from "react";
import { useConfig } from "@plugins/config_v2/web";
import { themeEngineConfig } from "../core";

export type ColorMode = "light" | "dark";
/** The CONFIGURED setting, before `system` is collapsed against the OS. */
export type ConfiguredColorMode = "light" | "dark" | "system";

// THE config scope that owns light/dark — the whole reason these hooks take no
// scope argument.
//
// Per-scope dark mode is DEFERRED: `<html>.dark` is one global class, and the
// `color-scheme` property it drives is a document-level thing. So every reader of
// color mode — the class applier, the pre-paint cache the class has to agree with
// on reload, and prop-themed third-party widgets (sonner, charts, editors) — must
// resolve at the SAME scope, or they render different schemes on one screen.
//
// They did. Three call sites each picked their own scope: the class read global,
// the pre-paint cache read the focused app's, and `useColorMode()` read the
// current app's. With a global `dark` and an app-scoped `light` that shipped a
// white first paint that flipped to dark once React mounted, and a light toaster
// over a dark app. Naming the scope ONCE, here, is what makes that class of
// disagreement unspellable: no caller can pass a different one.
//
// When per-scope dark lands, this is the one place that changes.
const COLOR_MODE_SCOPE_ID: string | undefined = undefined;

/**
 * The CONFIGURED color mode (`light` | `dark` | `system`) of the scope that owns
 * light/dark. Callers that need an actual scheme want {@link useResolvedColorMode};
 * this is for the pre-paint cache, which stores the setting rather than the
 * resolution so the replay script can re-resolve `system` against live matchMedia
 * on each load (an OS appearance flip between sessions still paints right).
 */
export function useConfiguredColorMode(): ConfiguredColorMode {
  const { colorMode } = useConfig(themeEngineConfig, {
    scopeId: COLOR_MODE_SCOPE_ID,
  }) as { colorMode: ConfiguredColorMode };
  return colorMode;
}

// Resolves the effective light/dark mode, collapsing the `system` setting against
// the OS `prefers-color-scheme` (with a live listener). This is THE single
// resolution of color mode — both the global `.dark` class applier and
// prop-themed third-party components (sonner, charts, editors) consume it, so the
// class, the `color-scheme` property, and every JS widget agree.
export function useResolvedColorMode(): ColorMode {
  const colorMode = useConfiguredColorMode();

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

// The resolved color mode — the same value driving the global `.dark` class. Use
// this to feed any component that themes itself via a prop (e.g.
// `<Sonner theme={useColorMode()} />`) instead of reading the class.
export function useColorMode(): ColorMode {
  return useResolvedColorMode();
}
