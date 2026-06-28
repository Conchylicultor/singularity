import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import { floatingChromeConfig } from "../../core";

/**
 * Theme-customizer row for the floating-window titlebar style. Two options over
 * the `seamlessTitlebar` boolean: "Framed" (the default bordered `bg-muted`
 * strip) and "Seamless" (borderless `bg-background`, fused with the window body).
 * Mirrors the tab-bar variant picker's segmented-button look so it sits
 * consistently among the other chrome pickers.
 *
 * Per-app: edits the customizer's editing tier (`useThemeScopeId()` — the forked
 * `app:<id>` when the current app is forked, else base/global), exactly like the
 * token-group rows, so titlebar edits land in the same scope as palette edits.
 */
export function TitlebarStylePicker() {
  const scopeId = useThemeScopeId();
  const { seamlessTitlebar } = useConfig(floatingChromeConfig, { scopeId });
  const setConfig = useSetConfig(floatingChromeConfig, { scopeId });

  const options = [
    { label: "Framed", seamless: false },
    { label: "Seamless", seamless: true },
  ];

  return (
    <Stack direction="row" gap="sm">
      {options.map((o) => (
        <button
          key={o.label}
          className={`px-md py-xs text-body rounded-md border transition-colors ${
            o.seamless === seamlessTitlebar
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("seamlessTitlebar", o.seamless)}
        >
          {o.label}
        </button>
      ))}
    </Stack>
  );
}
