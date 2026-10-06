import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  DataView,
  defineDataView,
  type FieldDef,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import type {
  HostedToolbar,
  HostedToolbarParts,
} from "@plugins/primitives/plugins/data-view/core";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import type { TreeChildrenState } from "@plugins/primitives/plugins/tree/core";
import type { HostFsEntry } from "@plugins/infra/plugins/host-fs/core";
import { FileTypeIcon } from "@plugins/primitives/plugins/file-type/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  formatCount,
  formatModified,
  formatModifiedFull,
  formatSize,
  joinPath,
  type EntryRow,
} from "../../core";
import type { Listing, Listings } from "../internal/listings";
import { FileBrowserSlots } from "../slots";
import { ExplorerControlsSlot } from "../internal/controls-slot";

const FILE_TREE_VIEW = defineDataView("file-explorer.tree");

/**
 * Whether the browser shows a listed entry, `path` in display form: Show
 * hidden files and every lens's hide rule decide it.
 */
export type EntryFilter = (entry: HostFsEntry, path: string) => boolean;

/** What a listing's failure says, in the user's terms. */
function listingFailure(listing: Listing): string | null {
  if (listing.error !== null) return listing.error;
  switch (listing.result?.kind) {
    case "denied":
      return "Permission denied";
    case "missing":
      return "This folder no longer exists";
    case "not-a-dir":
      return "Not a folder";
    case "ok":
    case undefined:
      return null;
  }
}

/** The entries a listing shows: folders first, then by name, as people sort. */
function visibleEntries(
  dir: string,
  entries: readonly HostFsEntry[],
  shows: EntryFilter,
): HostFsEntry[] {
  return entries
    .filter((e) => shows(e, joinPath(dir, e.name)))
    .sort((a, b) => {
      const ad = a.kind === "dir" ? 0 : 1;
      const bd = b.kind === "dir" ? 0 : 1;
      if (ad !== bd) return ad - bd;
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}

/**
 * The rows under `root`: its own entries, then — for every folder whose
 * listing has been fetched — that folder's entries, recursively. A folder's
 * children exist as rows only once listed; until then the tree shows its
 * chevron and asks for them (lazy children).
 */
function buildRows(
  listings: Listings,
  root: string,
  shows: EntryFilter,
): EntryRow[] {
  const rows: EntryRow[] = [];
  const walk = (dir: string, parentId: string | null) => {
    const listing = listings.get(dir);
    if (listing?.result?.kind !== "ok") return;
    let rank: Rank | null = null;
    for (const entry of visibleEntries(dir, listing.result.entries, shows)) {
      rank = Rank.between(rank, null);
      const path = joinPath(dir, entry.name);
      rows.push({
        id: path,
        parentId,
        rank,
        name: entry.name,
        path,
        kind: entry.kind,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        hidden: entry.hidden,
      });
      if (entry.kind === "dir") walk(path, path);
    }
  };
  walk(root, null);
  return rows;
}

/** How many entries a folder shows, once it is listed. */
export function childCount(
  listings: Listings,
  path: string,
  shows: EntryFilter,
): number | null {
  const result = listings.get(path)?.result;
  if (result?.kind !== "ok") return null;
  return result.entries.filter((e) => shows(e, joinPath(path, e.name))).length;
}

/** A tree-view listing's state, as the lazy-children contract spells it. */
function childrenState(listings: Listings, path: string): TreeChildrenState {
  const listing = listings.get(path);
  if (listing === undefined) return { kind: "unloaded" };
  const failure = listingFailure(listing);
  if (failure !== null) {
    return { kind: "failed", message: failure, retry: listing.retry };
  }
  if (listing.result === null) return { kind: "loading" };
  return { kind: "loaded" };
}

/**
 * No band: the explorer's own toolbar is the folder view's header. It owns the
 * name filter, and the parts the DataView hands this frame (the view switcher
 * once a second view is authored, any creators, and the options trigger —
 * sort, and filter on any field, a contributed one like git's "Changed vs
 * main" included, and fields — the only way to reach those controls) portal
 * into the toolbar cell it publishes, visible at rest like the buttons beside
 * them.
 */
function FileTreeFrame({
  switcher,
  creators,
  options,
  body,
}: HostedToolbarParts): ReactNode {
  const cell = ExplorerControlsSlot.useRoot();
  return (
    <>
      {cell.attached &&
        createPortal(
          <>
            {switcher}
            {creators}
            {options}
          </>,
          cell.root,
        )}
      {body}
    </>
  );
}

const HOSTED: HostedToolbar = {
  kind: "hosted",
  frame: FileTreeFrame,
  forms: { switcher: "chip", options: "visible" },
};

export interface FileTreeProps {
  root: string;
  /** The listings of the root and of every folder opened so far. */
  listings: Listings;
  /** Ask for a folder's listing (when the tree opens it). */
  request: (path: string) => void;
  shows: EntryFilter;
  query: string;
  onQueryChange: (q: string) => void;
  selectedPath: string | null;
  openPath: string | null;
  onActivate: (row: EntryRow) => void;
  onOpen: (row: EntryRow) => void;
  /** What an empty folder shows. */
  emptyState: ReactNode;
}

/**
 * The folder's contents as a DataView tree: Name / Modified / Size in aligned
 * columns plus every `FileBrowserSlots.Fields` contribution, folders first, every folder lazily listed through host-fs on first
 * expand. Clicking a folder makes it the listing; clicking a file selects it
 * (and opens it beside the listing). Double-click or Enter opens either.
 */
export function FileTree({
  root,
  listings,
  request,
  shows,
  query,
  onQueryChange,
  selectedPath,
  openPath,
  onActivate,
  onOpen,
  emptyState,
}: FileTreeProps): ReactNode {
  // "Today" is today as of this listing: the folder is re-listed on every visit.
  const [now] = useState(() => Date.now());
  const rows = useMemo(
    () => buildRows(listings, root, shows),
    [listings, root, shows],
  );

  const hierarchy = useMemo<HierarchyConfig<EntryRow>>(
    () => ({
      getParentId: (r) => r.parentId,
      getRank: (r) => r.rank,
      lazyChildren: {
        hasChildren: (r) => r.kind === "dir",
        state: (r) => childrenState(listings, r.path),
        load: (r) => request(r.path),
      },
    }),
    [listings, request],
  );

  const fields = useMemo<FieldDef<EntryRow>[]>(
    () => [
      { id: "name", label: "Name", primary: true, value: (r) => r.name },
      {
        id: "modified",
        label: "Modified",
        type: "number",
        width: "96px",
        value: (r) => r.mtimeMs,
        cell: (r) => (
          <span title={formatModifiedFull(r.mtimeMs)}>
            {formatModified(r.mtimeMs, now)}
          </span>
        ),
      },
      {
        id: "size",
        label: "Size",
        type: "number",
        width: "80px",
        value: (r) => (r.kind === "dir" ? null : r.size),
        cell: (r) => {
          if (r.kind !== "dir") return formatSize(r.size);
          const n = childCount(listings, r.path, shows);
          return n === null ? "—" : formatCount(n);
        },
      },
    ],
    [now, shows, listings],
  );

  const treeOptions = useMemo<TreeViewOptions<EntryRow>>(
    () => ({
      columns: "aligned",
      addLabel: null,
      leadingIcon: (r) => (
        <FileTypeIcon
          name={r.name}
          isDir={r.kind === "dir"}
          className="size-4"
        />
      ),
      openOnActivate: (r) => r.kind === "dir",
      labelClassName: (r) =>
        r.path === openPath ? cn("font-semibold") : undefined,
    }),
    [openPath],
  );

  return (
    <DataView<EntryRow>
      rows={rows}
      fields={fields}
      fieldExtensions={FileBrowserSlots.Fields}
      rowKey={(r) => r.id}
      views={["tree"]}
      storageKey={FILE_TREE_VIEW}
      toolbar={HOSTED}
      density="compact"
      hierarchy={hierarchy}
      search={{ query, onQueryChange }}
      searchAccessor={(r) => r.name}
      selectedRowId={selectedPath ?? undefined}
      onRowActivate={onActivate}
      onRowOpen={onOpen}
      viewOptions={{ tree: treeOptions }}
      emptyState={emptyState}
    />
  );
}
