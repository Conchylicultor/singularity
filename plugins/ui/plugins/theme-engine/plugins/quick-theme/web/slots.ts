import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export interface QuickThemeSectionContribution {
  /** Short heading rendered above the section inside the popover. */
  label: string;
  component: ComponentType;
}

/**
 * The quick-switch popover's own section slot. It is deliberately NOT the
 * customizer pane's `ThemeCustomizer.Section`: a pane section is authored for a
 * 440px-wide scrolling pane (search-driven, full catalogs, token rows), while a
 * quick section must fit a popover a user glances at without leaving their
 * context. A contributor that wants both surfaces contributes twice, with a
 * different component each time.
 */
export const QuickTheme = {
  Section: defineRenderSlot<QuickThemeSectionContribution>(
    "ui.theme-engine.quick-theme.section",
    { docLabel: (p) => p.label },
  ),
};
