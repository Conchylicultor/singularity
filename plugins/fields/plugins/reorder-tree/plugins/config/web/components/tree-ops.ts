import type {
  ReorderNode,
  ReorderTree,
} from "@plugins/fields/plugins/reorder-tree/core";
import { normalizeNode, type NormalizedNode } from "../../core";

// Pure `ReorderTree` ↔ view transforms for the settings-pane drag editor. The
// settings pane has no live contribution catalog, so the view is built purely
// from the saved tree (entryKey strings) — no `applyTree`, no drift.

export type ReorderViewEntry =
  | { kind: "item"; id: string }
  | { kind: "spacer"; id: string };

/** Ordered visible entries + the hidden bucket, derived from the saved tree. */
export function treeToView(tree: ReorderTree): {
  entries: ReorderViewEntry[];
  hiddenItems: Array<{ key: string; label: string }>;
} {
  const entries: ReorderViewEntry[] = [];
  const hiddenItems: Array<{ key: string; label: string }> = [];
  const seenSpacers = new Set<string>();
  for (const node of tree) {
    const n = normalizeNode(node);
    if (n.kind === "spacer") {
      // Dedup: there's no `applyTree` here, and duplicate sortable ids break dnd.
      if (seenSpacers.has(n.spacer)) continue;
      seenSpacers.add(n.spacer);
      entries.push({ kind: "spacer", id: n.spacer });
    } else if (n.kind === "item") {
      if (n.hidden) {
        hiddenItems.push({ key: n.item, label: n.item });
        continue;
      }
      entries.push({ kind: "item", id: n.item });
    }
    // group nodes (reserved/deferred) are not shown in the field editor.
  }
  return { entries, hiddenItems };
}

function serialize(n: NormalizedNode): ReorderNode {
  if (n.kind === "spacer") return { spacer: n.spacer };
  if (n.kind === "group") return { group: n.group, items: n.items };
  // Terse: a plain visible item is a bare string.
  return n.hidden ? { item: n.item, hidden: true } : n.item;
}

function nodeId(n: NormalizedNode): string | null {
  if (n.kind === "spacer") return n.spacer;
  if (n.kind === "item") return n.item;
  return null;
}

function isVisible(n: NormalizedNode): boolean {
  return (n.kind === "item" && !n.hidden) || n.kind === "spacer";
}

/**
 * Move `draggedId` to `overId`'s slot within the VISIBLE order (items + spacers).
 * Hidden items are appended last so a reorder never un-hides — mirroring the
 * middleware's `materializeTree`. Group nodes (deferred) are preserved at the end.
 */
export function reorderTree(
  tree: ReorderTree,
  draggedId: string,
  overId: string,
): ReorderTree {
  const norm = tree.map(normalizeNode);
  const visible = norm.filter(isVisible);
  const from = visible.findIndex((n) => nodeId(n) === draggedId);
  const to = visible.findIndex((n) => nodeId(n) === overId);
  if (from < 0 || to < 0 || from === to) return tree;

  const next = visible.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);

  const hidden = norm.filter((n) => n.kind === "item" && n.hidden);
  const groups = norm.filter((n) => n.kind === "group");
  return [...next, ...hidden, ...groups].map(serialize);
}

/** Flip a visible item to `{ item, hidden: true }` in place. */
export function hideInTree(tree: ReorderTree, key: string): ReorderTree {
  return tree.map((node) => {
    const n = normalizeNode(node);
    return n.kind === "item" && !n.hidden && n.item === key
      ? { item: key, hidden: true }
      : node;
  });
}

/**
 * Flip a hidden item back to a bare string, in place. (The field editor has no
 * natural-order catalog to re-append to — a harmless divergence from the
 * middleware, which restores to the end.)
 */
export function restoreInTree(tree: ReorderTree, key: string): ReorderTree {
  return tree.map((node) => {
    const n = normalizeNode(node);
    return n.kind === "item" && n.hidden && n.item === key ? key : node;
  });
}

export function addSpacer(tree: ReorderTree): ReorderTree {
  return [...tree, { spacer: crypto.randomUUID() }];
}

export function deleteSpacer(tree: ReorderTree, id: string): ReorderTree {
  return tree.filter((node) => {
    const n = normalizeNode(node);
    return !(n.kind === "spacer" && n.spacer === id);
  });
}
