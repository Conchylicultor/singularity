import { defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useConfigResult } from "@plugins/config_v2/web";
import { themeSelectionConfig } from "@plugins/ui/plugins/theme-engine/core";
import {
  useThemes,
  useThemeScopeId,
} from "@plugins/ui/plugins/theme-engine/web";
import { ThemeGalleryView } from "./theme-gallery-view";
import { ThemeItemActions } from "./theme-item-actions";

// Two surfaces, so two view configs: one config file per surface is what keeps
// the popover from offering the pane's card views (and vice versa). Both author
// the same named views with the same filters — to the user it is one list,
// drawn as cards in the pane and as rows in the popover.
const PANE_VIEW = defineDataView("theme-engine.themes");
const QUICK_VIEW = defineDataView("theme-engine.themes.quick");

const SECTION_TERMS = ["theme", "themes", "gallery"];

/**
 * Declared as the section's `useAvailable` rather than a `return null` in the
 * body: the host paints the card before it reaches the body, so a null there
 * would leave a "Theme" bar over nothing on every non-matching query.
 */
export function useThemeSectionMatchesSearch({
  search,
}: {
  search: string;
}): boolean {
  const q = search.trim().toLowerCase();
  return q.length === 0 || SECTION_TERMS.some((term) => term.includes(q));
}

/**
 * The customizer pane's theme picker: the Theme DataView as cards, with rename
 * and delete on the user's own themes. Picking a card selects it for the scope
 * the pane is editing (the app, once "Customize for <App>" is on; else the
 * desktop).
 */
export function ThemeGalleryPicker() {
  return (
    <ThemeGalleryView
      storageKey={PANE_VIEW}
      defaultView="mine"
      itemActions={ThemeItemActions}
    />
  );
}

/**
 * The section header's collapsed-state line: the theme the scope selects, so
 * a closed card still says what is picked. Nothing while that is not known
 * yet — an empty summary claims nothing.
 */
export function SelectedThemeSummary() {
  const scopeId = useThemeScopeId();
  const themes = useThemes();
  const selection = useConfigResult(themeSelectionConfig, { scopeId });
  if (themes.pending || selection.pending) return null;
  const theme = themes.themesById.get(selection.data.theme);
  return theme ? (
    <Text as="span" variant="caption" tone="muted">
      {theme.label}
    </Text>
  ) : (
    <Text as="span" variant="caption" tone="destructive">
      Missing theme
    </Text>
  );
}

/**
 * The quick-switch popover's theme picker: the same Theme DataView as compact
 * rows, for switching without leaving the current context. No row actions —
 * renaming and deleting are the pane's; a modal confirm opened from here would
 * close the popover that launched it.
 *
 * **Bounded, unlike the pane.** A DataView is natural-height and never owns a
 * scroller; in the popover that would let a 500-theme catalog push the
 * Variants section and the footer hundreds of rows down. So the picker gets
 * its OWN bounded scroller, with the DataView's toolbar pinning to the top of
 * it — the deliberate exception to the panel's "the popover is the single
 * scroll owner" rule, because a searchable catalog is unbounded by nature.
 */
export function QuickThemePicker() {
  return (
    <Scroll axis="y" className="max-h-72">
      <ThemeGalleryView
        storageKey={QUICK_VIEW}
        defaultView="mine"
        density="compact"
      />
    </Scroll>
  );
}
