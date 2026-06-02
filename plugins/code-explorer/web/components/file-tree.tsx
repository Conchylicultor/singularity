import { useEffect, useMemo, useState } from "react";
import {
  MdChevronRight,
  MdExpandMore,
  MdFolder,
  MdFolderOpen,
  MdInsertDriveFile,
} from "react-icons/md";
import {
  collectAllIds,
  filterTree,
  SearchInput,
} from "@plugins/primitives/plugins/search/web";
import { cn } from "@/lib/utils";

interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: FileTreeNode[];
}

function buildTree(paths: readonly string[]): FileTreeNode[] {
  const root: FileTreeNode = {
    name: "",
    path: "",
    isDir: true,
    children: [],
  };

  for (const full of paths) {
    const segments = full.split("/");
    let cursor = root;
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i]!;
      const isLeaf = i === segments.length - 1;
      let child = cursor.children.find((c) => c.name === name);
      if (!child) {
        const path = segments.slice(0, i + 1).join("/");
        child = {
          name,
          path,
          isDir: !isLeaf,
          children: [],
        };
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

interface FileTreeProps {
  files: readonly string[];
  selectedPath: string;
  onSelect: (path: string) => void;
}

export function FileTree({ files, selectedPath, onSelect }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Filtered-tree mode: a node survives if its own name matches, or any
  // descendant survives (recursive search across the whole worktree).
  const filtered = useMemo(() => {
    if (!q) return tree;
    return filterTree(
      tree,
      (node) => node.name.toLowerCase().includes(q),
      (node) => node.children,
      (node, children) => ({ ...node, children }),
    );
  }, [tree, q]);

  // While searching, auto-expand every surviving directory so matches deep in
  // the tree are visible without manual expansion.
  const autoExpanded = useMemo(() => {
    if (!q) return null;
    return new Set(
      collectAllIds(
        filtered,
        (node) => node.path,
        (node) => node.children,
      ),
    );
  }, [filtered, q]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (selectedPath) {
      const segments = selectedPath.split("/");
      for (let i = 1; i < segments.length; i++) {
        set.add(segments.slice(0, i).join("/"));
      }
    }
    return set;
  });

  useEffect(() => {
    if (!selectedPath) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      const segments = selectedPath.split("/");
      let changed = false;
      for (let i = 1; i < segments.length; i++) {
        const dir = segments.slice(0, i).join("/");
        if (!next.has(dir)) {
          next.add(dir);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedPath]);

  function toggle(dir: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }

  const effectiveExpanded = autoExpanded ?? expanded;

  return (
    <div className="text-sm">
      <div className="sticky top-0 z-10 border-b bg-background p-1.5">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files…"
          aria-label="Search files"
        />
      </div>
      <div className="py-1">
        {q && filtered.length === 0 ? (
          <div className="px-3 py-2 text-muted-foreground">No matches.</div>
        ) : (
          filtered.map((node) => (
            <Row
              key={node.path}
              node={node}
              depth={0}
              expanded={effectiveExpanded}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={toggle}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface RowProps {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedPath: string;
  onSelect: (path: string) => void;
  onToggle: (dir: string) => void;
}

function Row({
  node,
  depth,
  expanded,
  selectedPath,
  onSelect,
  onToggle,
}: RowProps) {
  const isOpen = expanded.has(node.path);
  const isSelected = !node.isDir && node.path === selectedPath;

  return (
    <>
      <button
        type="button"
        onClick={() => (node.isDir ? onToggle(node.path) : onSelect(node.path))}
        className={cn(
          "flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-muted",
          isSelected && "bg-accent text-accent-foreground",
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        title={node.path}
      >
        {node.isDir ? (
          <>
            {isOpen ? (
              <MdExpandMore className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <MdChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            {isOpen ? (
              <MdFolderOpen className="size-3.5 shrink-0 text-info" />
            ) : (
              <MdFolder className="size-3.5 shrink-0 text-info" />
            )}
          </>
        ) : (
          <>
            <span className="size-3.5 shrink-0" />
            <MdInsertDriveFile className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.isDir &&
        isOpen &&
        node.children.map((child) => (
          <Row
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}
