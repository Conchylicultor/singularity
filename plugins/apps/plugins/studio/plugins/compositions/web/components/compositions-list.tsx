import { useMemo, type ReactElement } from "react";
import { MdAdd, MdCompare, MdPublic } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import {
  useCompositionData,
  useManifestItems,
  useManifestActions,
  usePromoteManifestsToGit,
} from "@plugins/plugin-meta/plugins/composition/web";
import type { CompositionManifestItem } from "@plugins/plugin-meta/plugins/composition/core";
import { useServeComposition } from "@plugins/apps/plugins/studio/plugins/compositions/plugins/auto-serve/web";
import { compositionDetailPane, comparePane } from "../panes";
import { CompositionItemActions } from "./composition-item-actions";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**. The
// views config is authored at
// `config/apps/studio/compositions/studio.compositions.jsonc` (groupBy category).
const COMPOSITIONS_VIEW = defineDataView("studio.compositions");

/**
 * Stages the current compositions set as a committed git-layer "default for
 * everyone" via the composition plugin's promote API (which wraps the generic
 * config_v2 staging primitive — this pane never touches config_v2/staging
 * directly). The staged default surfaces in the review pane's "Default for
 * everyone" section, where it can be reviewed, applied (landed on `main`), or
 * discarded.
 */
function PromoteDefaultButton(): ReactElement {
  const { promote, ready } = usePromoteManifestsToGit();
  return (
    <WithTooltip content="Stage the current compositions as a committed default for everyone, reviewable in the review pane.">
      <Button variant="outline" disabled={!ready} onClick={() => promote()}>
        <MdPublic />
        Set as default for everyone
      </Button>
    </WithTooltip>
  );
}

/**
 * The compositions list pane's body: the list-scoped action row (New / Compare /
 * promote) above the DataView. The actions live here rather than in PaneChrome's
 * header because they act on the whole set, and "Set as default for everyone"
 * does not fit a 380px header bar.
 */
export function CompositionsList(): ReactElement {
  const { isLoading } = useCompositionData();
  const items = useManifestItems();
  const { save } = useManifestActions();
  const { serve, stop } = useServeComposition();
  const openPane = useOpenPane();
  // The URL is the selection — there is no local `editingId` state to drift.
  const selectedId = compositionDetailPane.useRouteEntry()?.params.id;

  // "New" writes the row first, then navigates to the id the write minted, so
  // the detail pane is always backed by a real config item.
  function newComposition(): void {
    const newId = save({
      name: "Untitled composition",
      entryPoints: [],
      selectedContributors: [],
    });
    openPane(compositionDetailPane, { id: newId }, { mode: "push", side: "right" });
  }

  return (
    <Inset pad="md">
      <Stack gap="lg">
        <Stack direction="row" align="center" justify="between" gap="sm">
          <Stack direction="row" align="center" gap="xs">
            <Button variant="outline" onClick={newComposition}>
              <MdAdd />
              New
            </Button>
            <Button
              variant="ghost"
              onClick={() => openPane(comparePane, {}, { mode: "push", side: "right" })}
            >
              <MdCompare />
              Compare
            </Button>
          </Stack>
          <PromoteDefaultButton />
        </Stack>

        {isLoading ? (
          <Loading variant="text" />
        ) : (
          <CompositionsDataView
            items={items}
            selectedId={selectedId ?? null}
            onServe={serve}
            onStop={stop}
            onSelect={(item) =>
              openPane(
                compositionDetailPane,
                { id: item.id },
                { mode: "push", side: "right" },
              )
            }
          />
        )}
      </Stack>
    </Inset>
  );
}

/**
 * The named compositions as a DataView `list`, grouped by `category` (the group
 * order — Profiles / Apps / Subsystems / Packs / Other — is the enum field's
 * `options` order; the section engine renders enum groups in options order). Each
 * row opens the composition's detail pane (`onRowActivate`); the entry /
 * contributor / extends counts are typed `int` fields (trailing chips, replacing
 * the old summary badge) so they come with sort / filter for free. A per-row
 * Delete lives in the hover-trailing item-actions slot; the `category` field is a
 * pure group/filter dimension kept out of the row body via the config's
 * `visibleFields`. GroupBy + visibleFields are authored in
 * `config/apps/studio/compositions/studio.compositions.jsonc`.
 */
function CompositionsDataView({
  items,
  selectedId,
  onSelect,
  onServe,
  onStop,
}: {
  items: CompositionManifestItem[];
  selectedId: string | null;
  onSelect: (item: CompositionManifestItem) => void;
  onServe: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const fields = useMemo<FieldDef<CompositionManifestItem>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        type: "text",
        value: (it) => it.name,
        primary: true,
        sortable: true,
      },
      {
        id: "category",
        label: "Category",
        type: "enum",
        value: (it) => it.category,
        // Options order is the group display order (profile / app / subsystem /
        // pack, then any other); `other` catches categories outside the taxonomy.
        options: [
          { value: "profile", label: "Profiles" },
          { value: "app", label: "Apps" },
          { value: "subsystem", label: "Subsystems" },
          { value: "pack", label: "Packs" },
          { value: "other", label: "Other" },
        ],
        sortable: true,
        filterable: true,
      },
      {
        id: "entryCount",
        label: "Entry points",
        type: "int",
        value: (it) => it.entryPoints.length,
        cell: (it) => (
          <span className="tabular-nums text-muted-foreground">
            {it.entryPoints.length} entry
          </span>
        ),
        align: "end",
        sortable: true,
      },
      {
        id: "contributorCount",
        label: "Contributors",
        type: "int",
        value: (it) => it.selectedContributors.length,
        cell: (it) => (
          <span className="tabular-nums text-muted-foreground">
            {it.selectedContributors.length} sel
          </span>
        ),
        align: "end",
        sortable: true,
      },
      {
        id: "extendsCount",
        label: "Extends",
        type: "int",
        value: (it) => it.extends.length,
        cell: (it) =>
          it.extends.length > 0 ? (
            <span className="tabular-nums text-muted-foreground">
              {it.extends.length} ext
            </span>
          ) : null,
        align: "end",
        sortable: true,
      },
      {
        // Opt-in auto build & serve. `value` keeps the field sortable and gives a
        // yes/no Filter pill for free; the trailing cell is a one-click ToggleChip
        // that writes MAIN's compositions config, which the CLI compose-serve
        // stage reads to compose + serve the composition at build time.
        id: "autoBuild",
        label: "Auto-serve",
        type: "bool",
        value: (it) => it.autoBuild,
        align: "end",
        cell: (it) => (
          <ToggleChip
            active={it.autoBuild}
            title={
              it.autoBuild
                ? "Auto-served — click to stop building & serving"
                : "Click to build & serve this composition at http://<id>.localhost:9000"
            }
            onClick={(e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              if (it.autoBuild) onStop(it.id);
              else onServe(it.id);
            }}
          >
            {it.autoBuild ? "Serving" : "Serve"}
          </ToggleChip>
        ),
        sortable: true,
        filterable: true,
      },
      {
        // Live serve URL, shown only once a composition is activated. Namespace
        // name == composition id, served by the gateway at <id>.localhost:9000.
        id: "serveUrl",
        label: "Serve URL",
        type: "text",
        value: (it) => (it.autoBuild ? `${it.id}.localhost:9000` : ""),
        cell: (it) =>
          it.autoBuild ? (
            <LinkChip
              mono
              title={`Open http://${it.id}.localhost:9000`}
              onClick={(e) => {
                e.stopPropagation();
                window.open(`http://${it.id}.localhost:9000`, "_blank", "noopener");
              }}
            >
              {it.id}.localhost:9000
            </LinkChip>
          ) : null,
        align: "end",
      },
    ],
    [onServe, onStop],
  );

  return (
    <DataView<CompositionManifestItem>
      rows={items}
      fields={fields}
      rowKey={(it) => it.id}
      views={["list"]}
      storageKey={COMPOSITIONS_VIEW}
      selectedRowId={selectedId ?? undefined}
      onRowActivate={onSelect}
      itemActions={CompositionItemActions}
      emptyState={<>No named compositions yet. Create one with New.</>}
    />
  );
}
