import { MdTune } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text, SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useActiveApp } from "@plugins/apps-core/web";
import { useScopeMembership } from "@plugins/config_v2/web";
import { themeEngineConfig } from "@plugins/ui/plugins/theme-engine/core";
import {
  ThemeEngine,
  ThemeScopeProvider,
} from "@plugins/ui/plugins/theme-engine/web";
import { QuickTheme } from "../slots";

/**
 * The variant pickers worth showing NEXT TO a theme switcher: the ones whose
 * choice survives a theme swap (`selects: "component"`). Token-group pickers
 * (`selects: "tokens"` — palette, shape, density, fonts, …) are deliberately
 * absent: the section above rewrites every one of them wholesale, so offering
 * them here would show the user a control their next click silently overwrites.
 * The full customizer pane still renders both.
 *
 * The filter reads the contribution's own declared axis — no contributor is
 * named here, so a new token group is excluded the day it is written.
 */
function ComponentVariantSection() {
  const hasAny = ThemeEngine.VariantGroup.useContributions().some(
    (g) => g.selects === "component",
  );
  if (!hasAny) return null;
  return (
    <Stack gap="md">
      <SectionLabel>Variants</SectionLabel>
      <ThemeEngine.VariantGroup.Render>
        {(g) =>
          g.selects === "component" ? (
            <Stack gap="2xs">
              <Text variant="label">{g.componentLabel}</Text>
              <g.component />
            </Stack>
          ) : null
        }
      </ThemeEngine.VariantGroup.Render>
    </Stack>
  );
}

/**
 * The quick-switch popover body: contributed quick sections (the community
 * theme picker) on top, every component variant picker below, and a footer that
 * hands off to the full customizer pane.
 *
 * Scope resolution mirrors the customizer pane exactly — edits target the active
 * app's own theme once that app has been forked ("Customize for <App>" in the
 * pane), and base otherwise — so switching a theme from here and from the pane
 * write the same place. Forking itself stays a pane concern; this surface only
 * follows the choice already made there.
 */
export function QuickThemePanel({
  onOpenEditor,
}: {
  onOpenEditor: () => void;
}) {
  const activeApp = useActiveApp();
  const scopeId = activeApp ? `app:${activeApp.id}` : undefined;
  const forked = useScopeMembership(themeEngineConfig, scopeId);
  const effectiveScopeId = forked && scopeId ? scopeId : undefined;

  return (
    <ThemeScopeProvider scopeId={effectiveScopeId}>
      <Stack gap="none">
        {/* The popover is the scroll owner: sections render at natural height, so
            the panel's overall length is what scrolls here. The one sanctioned
            exception is a section whose content is unbounded by nature (the
            500-entry theme catalog) — it bounds itself so the sections below it
            stay reachable. */}
        <Scroll axis="y" className="max-h-[60vh]">
          <Inset pad="md">
            <Stack gap="lg">
              <QuickTheme.Section.Render>
                {(s) => (
                  <Stack gap="sm">
                    <SectionLabel>{s.label}</SectionLabel>
                    <s.component />
                  </Stack>
                )}
              </QuickTheme.Section.Render>
              <ComponentVariantSection />
            </Stack>
          </Inset>
        </Scroll>
        <Inset pad="2xs" className="border-t border-border">
          <Button variant="ghost" onClick={onOpenEditor} className="w-full">
            <MdTune />
            Open theme editor
          </Button>
        </Inset>
      </Stack>
    </ThemeScopeProvider>
  );
}
