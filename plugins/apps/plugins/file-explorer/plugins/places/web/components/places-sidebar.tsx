import { useMemo, type ReactNode } from "react";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import type { SectionsToolbar } from "@plugins/primitives/plugins/data-view/core";
import type { ResourceReadiness } from "@plugins/primitives/plugins/live-state/core";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import type { IconRef } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import {
  useExplorerLocation,
  useHomeDir,
  useOpenExplorerFolder,
} from "@plugins/apps/plugins/file-explorer/plugins/browser/web";
import { absolutePath } from "@plugins/apps/plugins/file-explorer/plugins/browser/core";
import {
  FileExplorer,
  type PlaceGroup,
  type PlacesSource,
  type PlacesState,
} from "@plugins/apps/plugins/file-explorer/plugins/shell/web";

const PLACES_VIEW = defineDataView("file-explorer.places");

/**
 * Every authored section (Favorites, Worktrees, Locations) at once, each under
 * its header.
 */
const SECTIONS: SectionsToolbar = { kind: "sections" };

/** One place as a row: resolved, or a failed source (listed, saying why). */
interface PlaceRow {
  id: string;
  group: PlaceGroup;
  icon: IconRef;
  label: string;
  /** Where it leads; `null` for a place that failed to resolve. */
  path: string | null;
  message: string | null;
}

const GROUP_OPTIONS = [
  { value: "favorites", label: "Favorites" },
  { value: "locations", label: "Locations" },
];

const fields: FieldDef<PlaceRow>[] = [
  { id: "label", label: "Name", primary: true, value: (r) => r.label },
  {
    id: "group",
    label: "Group",
    type: "enum",
    options: GROUP_OPTIONS,
    value: (r) => r.group,
  },
];

const viewOptions = {
  list: {
    // A failed source's row says why on hover; its muted tone says it is not
    // a place to go.
    leading: (r: PlaceRow) => (
      <span title={r.message ?? undefined}>
        <Icon icon={r.icon} className="size-4" />
      </span>
    ),
  },
};

/**
 * The Places sidebar: the places of every `FileExplorer.Places` source as a
 * DataView list in sections — Favorites, Worktrees, Locations (config-authored
 * filters on `group`). The place whose folder the explorer is showing is the active row.
 * The list grows to fill the sidebar, so the storage meter after it sits at
 * the bottom.
 */
export function PlacesSidebar(): ReactNode {
  const sources = FileExplorer.Places.useContributions();
  return (
    <ResolvePlaces sources={sources} index={0} resolved={[]}>
      {(rows, pending) => <PlacesList rows={rows} pending={pending} />}
    </ResolvePlaces>
  );
}

/**
 * Resolve every source's `usePlaces` hook — one component per source, chained,
 * so each hook has its own component and the call order never changes.
 */
function ResolvePlaces({
  sources,
  index,
  resolved,
  children,
}: {
  sources: readonly PlacesSource[];
  index: number;
  resolved: readonly { source: PlacesSource; state: PlacesState }[];
  children: (rows: PlaceRow[], pending: boolean) => ReactNode;
}): ReactNode {
  const source = sources[index];
  if (source === undefined) {
    const { rows, pending } = placeRows(resolved);
    return children(rows, pending);
  }
  return (
    <ResolveSource key={source.id} source={source}>
      {(state) => (
        <ResolvePlaces
          sources={sources}
          index={index + 1}
          resolved={[...resolved, { source, state }]}
        >
          {children}
        </ResolvePlaces>
      )}
    </ResolveSource>
  );
}

function ResolveSource({
  source,
  children,
}: {
  source: PlacesSource;
  children: (state: PlacesState) => ReactNode;
}): ReactNode {
  const { usePlaces } = source;
  return children(usePlaces());
}

/**
 * Every resolved source's places as rows, in source order; a failed source is
 * one muted row saying why. `pending` while any source has not answered.
 */
function placeRows(
  resolved: readonly { source: PlacesSource; state: PlacesState }[],
): { rows: PlaceRow[]; pending: boolean } {
  const rows: PlaceRow[] = [];
  let pending = false;
  for (const { source, state } of resolved) {
    switch (state.kind) {
      case "pending":
        pending = true;
        break;
      case "failed":
        rows.push({
          id: source.id,
          group: source.group,
          icon: state.icon,
          label: state.label,
          path: null,
          message: state.message,
        });
        break;
      case "ready":
        for (const place of state.places) {
          rows.push({
            id: `${source.id}:${place.id}`,
            group: source.group,
            icon: place.icon,
            label: place.label,
            path: place.path,
            message: null,
          });
        }
        break;
    }
  }
  return { rows, pending };
}

function PlacesList({
  rows,
  pending,
}: {
  rows: PlaceRow[];
  pending: boolean;
}): ReactNode {
  const location = useExplorerLocation();
  const home = useHomeDir();
  const openFolder = useOpenExplorerFolder();
  const readiness: ResourceReadiness =
    pending || home.kind === "pending"
      ? { status: "loading" }
      : { status: "ready" };
  const activeId = useMemo(() => {
    if (home.kind !== "ready") return undefined;
    const here = absolutePath(location.dir, home.home);
    return rows.find(
      (r) => r.path !== null && absolutePath(r.path, home.home) === here,
    )?.id;
  }, [rows, location.dir, home]);

  return (
    // The block padding sits on an inner box, never on the `Scroll`: a sticky
    // section header pins at its scroller's PADDING edge, so padding there
    // leaves a see-through strip above the pinned head.
    <Scroll fill>
      <div className="py-xs">
        <DataView<PlaceRow>
          rows={rows}
          readiness={readiness}
          fields={fields}
          rowKey={(r) => r.id}
          views={["list"]}
          storageKey={PLACES_VIEW}
          toolbar={SECTIONS}
          density="compact"
          selectedRowId={activeId}
          rowActivation={(r) => {
            const { path } = r;
            return path === null ? undefined : () => openFolder(path);
          }}
          rowTone={(r) => (r.path === null ? "muted" : "default")}
          viewOptions={viewOptions}
        />
      </div>
    </Scroll>
  );
}
