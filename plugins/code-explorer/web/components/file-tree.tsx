import { useCallback, useMemo } from "react";
import { MdFolder, MdInsertDriveFile } from "react-icons/md";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  DataView,
  defineDataView,
  type DataViewId,
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

// No expand hooks. Expand/collapse is per-(surface, view-instance, row) device-
// local render state owned by the data-view primitive, so this hierarchy closes
// over nothing and is a module constant. Revealing the selected file's ancestor
// directories is the tree primitive's own reveal-on-select, driven by
// `selectedRowId` below.
const hierarchy: HierarchyConfig<FileRow> = {
  getParentId: (r) => r.parentId,
  getRank: (r) => r.rank,
};

interface FileTreeProps {
  files: readonly string[];
  selectedPath: string;
  onSelect: (path: string) => void;
  /**
   * Which surface's view/filter/sort config and expand map this tree reads and
   * writes. Defaults to the Explorer pane's own. A second surface rendering this
   * tree MUST pass its own marker — sharing one would make filtering either tree
   * filter both, and (paths overlapping) collapse a folder in both at once.
   */
  storageKey?: DataViewId;
}

export function FileTree({
  files,
  selectedPath,
  onSelect,
  storageKey = FILE_TREE_VIEW,
}: FileTreeProps) {
  const rows = useMemo(() => buildFileRows(files), [files]);

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
      expandOnActivate: (r) => r.isDir,
      leadingIcon: (r) =>
        r.isDir ? (
          <MdFolder className="size-4 text-info" />
        ) : (
          <MdInsertDriveFile className="size-4 text-muted-foreground" />
        ),
    }),
    [],
  );

  // Only file rows reach here: a directory row's body click is routed to its own
  // expand toggle by `expandOnActivate`, never to activation.
  const handleActivate = useCallback(
    (row: FileRow) => onSelect(row.path),
    [onSelect],
  );

  return (
    <DataView<FileRow>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      views={["tree"]}
      storageKey={storageKey}
      hierarchy={hierarchy}
      selectedRowId={selectedPath || undefined}
      onRowActivate={handleActivate}
      searchAccessor={(r) => r.path}
      viewOptions={{ tree: treeOptions }}
    />
  );
}
