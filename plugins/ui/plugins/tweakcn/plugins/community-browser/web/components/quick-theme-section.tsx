import { useMemo } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { CatalogTheme } from "../../shared";
import { getCatalog } from "../../core";
import { useApplyCatalogTheme } from "../internal/use-apply-catalog-theme";
import { QuickThemeSwatch } from "./quick-theme-swatch";

const QUICK_THEME_VIEW = defineDataView("tweakcn.quick-theme");

/**
 * The community catalog as a quick picker for the theme popover: the same
 * DataView surface the pane's gallery is, rendered as a compact LIST of
 * `QuickThemeSwatch` rows instead of the pane's 64px preview cards. Search,
 * tag filtering, sort and named views therefore come from the primitive — this
 * section owns only the rows, the field schema, and the row body.
 *
 * **A list, not a gallery, because this band lives in a `picker` panel.** The
 * quick-theme panel is 320px, so a 190px-min card grid resolves to ONE column
 * of 272px cards showing four dots and a short name — the width is spent on
 * card chrome rather than on themes. Measured in the deployed panel: ~3.5 cards
 * visible in this section's 288px scroller, against ~7 in the 480px popover it
 * replaced. A row is ~32px to a card's ~82, so the same scroller shows ~9 —
 * denser than either. The view TYPE authored in
 * `config/ui/tweakcn/community-browser/tweakcn.quick-theme.jsonc` must move
 * with this prop: config is the single source of truth for view instances, and
 * an instance naming a type the surface no longer offers resolves to null.
 *
 * **Bounded, unlike the pane.** A DataView is natural-height and never owns a
 * scroller; here that would let a 500-theme catalog push the popover's Variants
 * section and footer hundreds of rows down. So the picker gets its OWN bounded
 * scroller: a fixed-height region no matter how large the catalog grows, with
 * the DataView's toolbar pinning to the top of it and everything below the
 * section still one glance away. That makes this the deliberate exception to the
 * panel's "the popover is the single scroll owner" rule — a searchable catalog
 * is unbounded by nature, so it is the one section that must bound itself.
 */
export function QuickThemeSection() {
  const { data, isLoading } = useEndpoint(getCatalog, {});
  const themes = data?.themes;
  const { applyingId, applyTheme } = useApplyCatalogTheme();

  const rows = useMemo(() => themes ?? [], [themes]);

  // Tag options drive the Filter pill's value picker — a closed set derived from
  // the catalog itself, exactly as the pane's gallery does it.
  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of rows) {
      for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => ({ value: tag, label: tag }));
  }, [rows]);

  const fields = useMemo<FieldDef<CatalogTheme>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        type: "text",
        primary: true,
        value: (t) => t.name,
      },
      {
        id: "tags",
        label: "Tags",
        type: "tags",
        values: (t) => t.tags,
        options: tagOptions,
        sortable: false,
      },
    ],
    [tagOptions],
  );

  return (
    <Scroll axis="y" className="max-h-72">
      <DataView<CatalogTheme>
        storageKey={QUICK_THEME_VIEW}
        rows={rows}
        fields={fields}
        rowKey={(t) => t.id}
        views={["list"]}
        defaultView="themes"
        loading={isLoading}
        searchAccessor={(t) => `${t.name} ${t.tags.join(" ")}`}
        // Picking a swatch applies its theme. It lives here rather than inside
        // the swatch because the swatch is only a body — the Row the list
        // builds owns the click and the Enter/Space handling.
        onRowActivate={(t) => applyTheme(t.id)}
        emptyState={
          <Text as="p" variant="body" tone="muted">
            No themes match your search.
          </Text>
        }
        viewOptions={{
          list: {
            // Each swatch is ALREADY one line (dots + name), so a row is its
            // natural shape and the card chrome around it only bought padding.
            size: "sm",
            renderRow: (t: CatalogTheme) => (
              <QuickThemeSwatch theme={t} isPending={applyingId === t.id} />
            ),
          },
        }}
      />
    </Scroll>
  );
}
