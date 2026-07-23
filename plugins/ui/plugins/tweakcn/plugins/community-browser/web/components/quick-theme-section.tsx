import { useMemo, useState } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { getCatalog } from "../../core";
import { useApplyCatalogTheme } from "../internal/use-apply-catalog-theme";
import { QuickThemeSwatch } from "./quick-theme-swatch";

/** How many swatches the popover shows before asking the user to narrow down. */
const QUICK_LIMIT = 12;

/**
 * The community catalog as a quick picker for the theme popover: type to narrow,
 * click a swatch to apply. Deliberately a bounded head of the matches rather than
 * a scrolling list — the popover already owns one scroller, and a nested one
 * makes a 500-theme catalog feel like a browser instead of a switcher. The
 * pane's full gallery (search, tags, import-by-URL) is one click away.
 */
export function QuickThemeSection() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useEndpoint(getCatalog, {});
  const { applyingId, applyTheme } = useApplyCatalogTheme();

  const matches = useMemo(() => {
    const themes = data?.themes ?? [];
    const q = search.trim().toLowerCase();
    if (q.length === 0) return themes;
    return themes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const shown = matches.slice(0, QUICK_LIMIT);
  const overflow = matches.length - shown.length;

  return (
    <Stack gap="sm">
      <SearchInput
        placeholder="Search themes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isLoading ? (
        <Loading variant="rows" count={4} />
      ) : shown.length === 0 ? (
        <Placeholder>No themes match your search.</Placeholder>
      ) : (
        <Grid cols={2} gap="xs">
          {/* eslint-disable-next-line data-view/no-adhoc-row-list -- transient picker chrome inside a popover: a DataView owns a toolbar + sticky header and expects the enclosing pane's single scroller, neither of which exists here. */}
          {shown.map((t) => (
            <QuickThemeSwatch
              key={t.id}
              theme={t}
              isPending={applyingId === t.id}
              onApply={() => applyTheme(t.id)}
            />
          ))}
        </Grid>
      )}
      {overflow > 0 && (
        <Text variant="caption" tone="muted">
          {overflow} more — refine your search, or open the theme editor.
        </Text>
      )}
    </Stack>
  );
}
