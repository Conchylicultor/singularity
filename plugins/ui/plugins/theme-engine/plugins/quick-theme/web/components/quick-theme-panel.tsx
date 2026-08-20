import { MdTune } from "react-icons/md";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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
    <ControlPanel.Section label="Variants">
      <Stack gap="md">
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
    </ControlPanel.Section>
  );
}

/**
 * The quick-switch panel body: contributed quick sections on top (the community
 * theme picker, then the light/dark switch — this file names neither, and their
 * order is reorder config's), every component variant picker below, and a footer
 * that hands off to the full customizer pane.
 *
 * It is a CONTROL PANEL body and therefore paints nothing of its own — no
 * padding, no scroll region, no bordered footer band. The `ControlPanelPopover`
 * that opens it owns the surface (and the scrolling), and the panel draws the
 * hairline above each band, which is why the footer here is a `Footer` rather
 * than an `Inset` with a `border-t`. Its action takes a leading `icon`, like
 * every footer in the vocabulary (invariant #4) — and this is the one panel
 * where that is visible: a footer row is still a row, so the ⚙ down here opens
 * the icon column and the variant rows above indent their labels 26px. The
 * alternative was three different treatments of one footer glyph across the
 * app, and uniformity won that trade.
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
      {/* The popover is the scroll owner: sections render at natural height, so
          the panel's overall length is what scrolls. The one sanctioned
          exception is a section whose content is unbounded by nature (the
          500-entry theme catalog) — it bounds itself so the sections below it
          stay reachable. */}
      <QuickTheme.Section.Render>
        {(s) => (
          <ControlPanel.Section label={s.label}>
            <s.component />
          </ControlPanel.Section>
        )}
      </QuickTheme.Section.Render>
      <ComponentVariantSection />
      <ControlPanel.Footer>
        <ControlPanel.Row icon={<MdTune />} onSelect={onOpenEditor}>
          Open theme editor
        </ControlPanel.Row>
      </ControlPanel.Footer>
    </ThemeScopeProvider>
  );
}
