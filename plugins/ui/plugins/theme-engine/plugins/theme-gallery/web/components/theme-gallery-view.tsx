import { useMemo } from "react";
import {
  DataView,
  type DataViewDensity,
  type DataViewId,
  type ItemActionsDescriptor,
} from "@plugins/primitives/plugins/data-view/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { themeFields, themeSearchText } from "../internal/theme-fields";
import type { ThemeRow } from "../internal/theme-rows";
import { useThemeGallery } from "../internal/use-theme-gallery";
import { ThemeCard } from "./theme-card";
import { ThemeSwatch } from "./theme-swatch";

const NO_ROWS: ThemeRow[] = [];

/**
 * A scope whose selected theme does not exist paints Default — and the picker
 * says so, so this is where the user finds out rather than wondering why the
 * app changed. Reachable only by hand-editing a config file: deleting a theme
 * moves the scopes that select it to Default first.
 */
function MissingThemeNotice({
  themeId,
  scopeLabel,
}: {
  themeId: string;
  scopeLabel: string;
}) {
  return (
    <Text as="p" variant="caption" tone="destructive" role="alert">
      {scopeLabel} selects the theme “{themeId}”, which no longer exists, so it
      shows Default. Pick a theme to replace it.
    </Text>
  );
}

/**
 * The Theme DataView, for the scope of the surrounding `ThemeScopeProvider`.
 * Both hosts render this one component over the same rows and schema; each
 * passes its own surface id, so its named views are its own (cards in the
 * customizer pane, compact rows in the quick-switch popover).
 *
 * Which body a row gets follows the view TYPE its config authors — a
 * `gallery` view draws `ThemeCard`s, a `list` view `ThemeSwatch` rows — so a
 * host that adds a list view to its config gets the compact row with no code.
 */
export function ThemeGalleryView({
  storageKey,
  defaultView,
  density,
  itemActions,
}: {
  storageKey: DataViewId;
  /** The view instance a device with no remembered choice opens on. */
  defaultView: string;
  density?: DataViewDensity;
  itemActions?: ItemActionsDescriptor<ThemeRow>;
}) {
  const { state, activate, adoptingKey } = useThemeGallery();
  const rows = state.pending ? NO_ROWS : state.rows;
  const fields = useMemo(() => themeFields(rows), [rows]);

  return (
    <Stack gap="sm">
      {!state.pending && state.missing !== undefined ? (
        <MissingThemeNotice
          themeId={state.missing}
          scopeLabel={state.scopeLabel}
        />
      ) : null}
      <DataView<ThemeRow>
        storageKey={storageKey}
        rows={rows}
        fields={fields}
        rowKey={(r) => r.key}
        defaultView={defaultView}
        density={density}
        loading={state.pending}
        selectedRowId={state.pending ? undefined : state.selectedKey}
        searchAccessor={themeSearchText}
        // Selecting lives here rather than in the card or row, which are only
        // bodies — the DataCard / Row the view builds owns the click and the
        // Enter/Space handling.
        onRowActivate={(row) => void activate(row)}
        itemActions={itemActions}
        emptyState={
          <Text as="p" variant="body" tone="muted">
            No themes match.
          </Text>
        }
        viewOptions={{
          gallery: {
            size: "sm",
            minCardWidth: 168,
            renderBody: (row: ThemeRow) => (
              <ThemeCard row={row} isPending={adoptingKey === row.key} />
            ),
          },
          list: {
            // Each swatch is ALREADY one line (dots + name), so a row is its
            // natural shape.
            size: "sm",
            renderRow: (row: ThemeRow) => (
              <ThemeSwatch row={row} isPending={adoptingKey === row.key} />
            ),
          },
        }}
      />
    </Stack>
  );
}
