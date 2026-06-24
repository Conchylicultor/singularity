import { useCallback, useMemo, useState } from "react";
import { MdFolder, MdInsertDriveFile } from "react-icons/md";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  DataView,
  defineDataView,
  type FieldDef,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";

const FILE_TREE_VIEW = defineDataView("code-explorer.file-tree");

/**
 * A flat row for the DataView tree. The file list arrives as a flat array of
 * slash-delimited path strings (no explicit parent / type metadata), so the
 * hierarchy is *derived* from the paths: every intermediate segment becomes a
 * directory row, the leaf a file row, and `parentId` is the parent's path. The
 * DataView tree view rebuilds the visible tree from `parentId` + `rank`.
 */
interface FileRow {
  /** Full path — unique, so it doubles as the row id. */
  id: string;
  /** Parent directory path, or null for a top-level entry. */
  parentId: string | null;
  rank: Rank;
  /** Last path segment — the rendered label. */
  name: string;
  path: string;
  isDir: boolean;
}

interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: FileTreeNode[];
}

/**
 * Build the nested directory tree from flat path strings, sorted directories
 * first then alphabetically. Kept as the intermediate shape so the flatten step
 * can walk it in display order and assign each sibling group an ascending
 * fractional rank (mirroring the config-nav `flattenConfigTree` precedent).
 */
function buildNestedTree(paths: readonly string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", isDir: true, children: [] };

  for (const full of paths) {
    const segments = full.split("/");
    let cursor = root;
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i]!;
      const isLeaf = i === segments.length - 1;
      let child = cursor.children.find((c) => c.name === name);
      if (!child) {
        const path = segments.slice(0, i + 1).join("/");
        child = { name, path, isDir: !isLeaf, children: [] };
        cursor.children.push(child);
      }
      cursor = child;
    }
  }

  sortTree(root);
  return root.children;
}

function sortTree(node: FileTreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

/**
 * Flatten the nested tree into DataView rows in DFS / display order, assigning
 * each sibling group an ascending fractional rank so the tree primitive renders
 * them in the same directories-first, alphabetical order.
 */
function buildFileRows(paths: readonly string[]): FileRow[] {
  const out: FileRow[] = [];
  const ROOT = " root";
  const lastRank = new Map<string, Rank>();
  const nextRank = (parentId: string | null): Rank => {
    const key = parentId ?? ROOT;
    const rank = Rank.between(lastRank.get(key) ?? null, null);
    lastRank.set(key, rank);
    return rank;
  };

  const walk = (nodes: FileTreeNode[], parentId: string | null): void => {
    for (const node of nodes) {
      out.push({
        id: node.path,
        parentId,
        rank: nextRank(parentId),
        name: node.name,
        path: node.path,
        isDir: node.isDir,
      });
      walk(node.children, node.path);
    }
  };

  walk(buildNestedTree(paths), null);
  return out;
}

/** Ancestor directory paths of a file path (excluding the file itself). */
function ancestorsOf(path: string): string[] {
  if (!path) return [];
  const segments = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    out.push(segments.slice(0, i).join("/"));
  }
  return out;
}

interface FileTreeProps {
  files: readonly string[];
  selectedPath: string;
  onSelect: (path: string) => void;
}

export function FileTree({
  files,
  selectedPath,
  onSelect,
}: FileTreeProps) {
  const rows = useMemo(() => buildFileRows(files), [files]);

  // Locally-tracked user-driven expand state (empty = all collapsed). The
  // selected file's ancestors are *derived* on top of this set during render
  // (see `effectiveExpanded`) so an externally-driven selection is always
  // revealed without an extra render cycle.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // The set actually rendered: the user's toggles unioned with the selection's
  // ancestor directories. Derived in render (no state mirror, no effect) so a
  // selection change reveals the file in the same commit it arrives.
  const effectiveExpanded = useMemo(() => {
    if (!selectedPath) return expanded;
    const s = new Set(expanded);
    for (const dir of ancestorsOf(selectedPath)) s.add(dir);
    return s;
  }, [expanded, selectedPath]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return set;
    });
  }, []);

  const hierarchy = useMemo<HierarchyConfig<FileRow>>(
    () => ({
      getParentId: (r) => r.parentId,
      getRank: (r) => r.rank,
      isExpanded: (r) => effectiveExpanded.has(r.id),
      onToggleExpanded: (id, next) =>
        setExpanded((prev) => {
          const set = new Set(prev);
          if (next) set.add(id);
          else set.delete(id);
          return set;
        }),
    }),
    [effectiveExpanded],
  );

  // `name` is the primary (only-rendered-in-tree) field; `kind` is filter-only —
  // invisible in the tree body but usable in the "Filter" pill (Folder / File).
  const fields = useMemo<FieldDef<FileRow>[]>(
    () => [
      { id: "name", label: "Name", primary: true, value: (r) => r.name },
      {
        id: "kind",
        label: "Type",
        type: "enum",
        options: [
          { value: "folder", label: "Folder" },
          { value: "file", label: "File" },
        ],
        value: (r) => (r.isDir ? "folder" : "file"),
      },
    ],
    [],
  );

  const treeOptions = useMemo<TreeViewOptions<FileRow>>(
    () => ({
      expandAll: true,
      leadingIcon: (r) =>
        r.isDir ? (
          <MdFolder className="size-4 text-info" />
        ) : (
          <MdInsertDriveFile className="size-4 text-muted-foreground" />
        ),
    }),
    [],
  );

  // A directory row toggles its own expand state on body click (the chevron does
  // the same, stopping propagation so they never double-fire); a file row drives
  // the host's selection.
  const handleActivate = useCallback(
    (row: FileRow) => {
      if (row.isDir) toggle(row.id);
      else onSelect(row.path);
    },
    [toggle, onSelect],
  );

  return (
    <DataView<FileRow>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      views={["tree"]}
      storageKey={FILE_TREE_VIEW}
      hierarchy={hierarchy}
      selectedRowId={selectedPath || undefined}
      onRowActivate={handleActivate}
      searchAccessor={(r) => r.path}
      viewOptions={{ tree: treeOptions }}
    />
  );
}
