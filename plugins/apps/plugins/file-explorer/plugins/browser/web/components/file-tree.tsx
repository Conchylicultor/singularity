import { useMemo, useState, type ReactNode } from "react";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  DataView,
  defineDataView,
  type FieldDef,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import type { HostedToolbar } from "@plugins/primitives/plugins/data-view/core";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import type { TreeChildrenState } from "@plugins/primitives/plugins/tree/core";
import type {
  HostFsEntry,
  HostFsEntryKind,
} from "@plugins/infra/plugins/host-fs/core";
import { FileTypeIcon } from "@plugins/primitives/plugins/file-type/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  formatCount,
  formatModified,
  formatModifiedFull,
  formatSize,
  joinPath,
} from "../../core";
import type { Listing, Listings } from "../internal/listings";

const FILE_TREE_VIEW = defineDataView("file-explorer.tree");

/** One entry of a listed folder, as a tree row. Its path is its id. */
export interface EntryRow {
  id: string;
  parentId: string | null;
  rank: Rank;
  name: string;
  path: string;
  kind: HostFsEntryKind;
  size: number;
  mtimeMs: number;
  hidden: boolean;
}

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
  entries: readonly HostFsEntry[],
  showHidden: boolean,
): HostFsEntry[] {
  return entries
    .filter((e) => showHidden || !e.hidden)
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
  showHidden: boolean,
): EntryRow[] {
  const rows: EntryRow[] = [];
  const walk = (dir: string, parentId: string | null) => {
    const listing = listings.get(dir);
    if (listing?.result?.kind !== "ok") return;
    let rank: Rank | null = null;
    for (const entry of visibleEntries(listing.result.entries, showHidden)) {
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
  showHidden: boolean,
): number | null {
  const result = listings.get(path)?.result;
  if (result?.kind !== "ok") return null;
  return result.entries.filter((e) => showHidden || !e.hidden).length;
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

/** Hosted toolbar: no band — the explorer's own toolbar owns the filter. */
const HOSTED: HostedToolbar = {
  kind: "hosted",
  frame: ({ body }) => body,
};

export interface FileTreeProps {
  root: string;
  /** The listings of the root and of every folder opened so far. */
  listings: Listings;
  /** Ask for a folder's listing (when the tree opens it). */
  request: (path: string) => void;
  showHidden: boolean;
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
 * columns, folders first, every folder lazily listed through host-fs on first
 * expand. Click selects (a file opens beside the listing), double-click or
 * Enter opens (a folder becomes the listing).
 */
export function FileTree({
  root,
  listings,
  request,
  showHidden,
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
    () => buildRows(listings, root, showHidden),
    [listings, root, showHidden],
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
          const n = childCount(listings, r.path, showHidden);
          return n === null ? "—" : formatCount(n);
        },
      },
    ],
    [now, showHidden, listings],
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
      labelClassName: (r) =>
        r.path === openPath ? cn("font-semibold") : undefined,
    }),
    [openPath],
  );

  return (
    <DataView<EntryRow>
      rows={rows}
      fields={fields}
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
