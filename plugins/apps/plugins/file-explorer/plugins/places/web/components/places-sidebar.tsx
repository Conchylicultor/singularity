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
  type PlaceItem,
  type PlaceState,
} from "@plugins/apps/plugins/file-explorer/plugins/shell/web";

const PLACES_VIEW = defineDataView("file-explorer.places");

/** Every authored section (Favorites, Locations) at once, each under its header. */
const SECTIONS: SectionsToolbar = { kind: "sections" };

/** One place as a row: resolved, or failed (listed, saying why). */
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
    leading: (r: PlaceRow) => <Icon icon={r.icon} className="size-4" />,
  },
};

/**
 * The Places sidebar: every `FileExplorer.Place` contribution as a DataView
 * list in two sections, Favorites and Locations (config-authored filters on
 * `group`). The place whose folder the explorer is showing is the active row.
 * The list grows to fill the sidebar, so the storage meter after it sits at
 * the bottom.
 */
export function PlacesSidebar(): ReactNode {
  const items = FileExplorer.Place.useContributions();
  return (
    <ResolvePlaces items={items} index={0} resolved={[]}>
      {(rows, pending) => <PlacesList rows={rows} pending={pending} />}
    </ResolvePlaces>
  );
}

/**
 * Resolve every place's `usePlace` hook — one component per place, chained, so
 * each hook has its own component and the call order never changes.
 */
function ResolvePlaces({
  items,
  index,
  resolved,
  children,
}: {
  items: readonly PlaceItem[];
  index: number;
  resolved: readonly { item: PlaceItem; state: PlaceState }[];
  children: (rows: PlaceRow[], pending: boolean) => ReactNode;
}): ReactNode {
  const item = items[index];
  if (item === undefined) {
    const rows: PlaceRow[] = [];
    let pending = false;
    for (const { item: it, state } of resolved) {
      if (state.kind === "pending") {
        pending = true;
        continue;
      }
      rows.push({
        id: it.id,
        group: it.group,
        icon: it.icon,
        label: state.label,
        path: state.kind === "ready" ? state.path : null,
        message: state.kind === "failed" ? state.message : null,
      });
    }
    return children(rows, pending);
  }
  return (
    <ResolvePlace key={item.id} item={item}>
      {(state) => (
        <ResolvePlaces
          items={items}
          index={index + 1}
          resolved={[...resolved, { item, state }]}
        >
          {children}
        </ResolvePlaces>
      )}
    </ResolvePlace>
  );
}

function ResolvePlace({
  item,
  children,
}: {
  item: PlaceItem;
  children: (state: PlaceState) => ReactNode;
}): ReactNode {
  const { usePlace } = item;
  return children(usePlace());
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
    <Scroll fill className="py-xs">
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
    </Scroll>
  );
}
