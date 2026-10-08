import type { ReactNode } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type { LazyChildren, TreeChildrenState } from "../../core";
import type { TreeItem } from "./types";
import { TreeGuides } from "./tree-guides";
import { treeRowIndentStyle } from "./tree-indent";

/**
 * What an expanded, lazily-listed node shows beneath it in place of children it
 * does not have (yet): the listing in flight, the listing's failure, or the
 * listing's confirmed emptiness. `null` = nothing to show (the children are
 * there, or the node is not lazy / not open).
 */
export type ChildPlaceholder =
  | { kind: "loading" }
  | { kind: "empty" }
  | Extract<TreeChildrenState, { kind: "failed" }>;

/**
 * The ONE answer to "does this open node need a placeholder child row?", shared
 * by the recursive render (`RowChrome`) and the windowed flat list, so the two
 * paint the same rows.
 *
 * - `unloaded` / `loading` with no children yet → loading (an unloaded open node
 *   is about to be asked — see `useLazyLoadRequests`). With children already
 *   there it is a refresh, and the rows it has stay as they are. Under a search
 *   an `unloaded` node shows nothing: the search opened it, nobody asked.
 * - `failed` → the failure, children or not: a stale listing must not read as a
 *   current one.
 * - `loaded` with no children → empty — but not while a search narrows the tree,
 *   where "no children" means "no matching children".
 */
export function childPlaceholder<T extends TreeItem>(
  node: T & { children: readonly unknown[] },
  lazy: LazyChildren<T> | undefined,
  searching: boolean,
): ChildPlaceholder | null {
  if (!lazy || !node.expanded || !lazy.hasChildren(node)) return null;
  const state = lazy.state(node);
  switch (state.kind) {
    case "failed":
      return state;
    case "loaded":
      return node.children.length === 0 && !searching
        ? { kind: "empty" }
        : null;
    case "unloaded":
      // A search force-opens what it keeps without asking for listings (see
      // `useLazyLoadRequests`), so an unlisted node it opened is not "about to
      // load" — it simply shows nothing below it.
      if (searching) return null;
      return node.children.length === 0 ? { kind: "loading" } : null;
    case "loading":
      return node.children.length === 0 ? { kind: "loading" } : null;
  }
}

/**
 * The placeholder child row: indented one level below its parent and aligned to
 * the label column (past the chevron slot), so it reads as the parent's content
 * rather than as a sibling. Same height invariant as `TreeRowChrome`.
 */
export function TreeChildPlaceholder({
  placeholder,
  depth,
  guides = false,
}: {
  placeholder: ChildPlaceholder;
  /** The depth of the CHILD row (parent depth + 1). */
  depth: number;
  /** Draw the indent guides its sibling rows draw (`TreeListProps.guides`). */
  guides?: boolean;
}): ReactNode {
  return (
    <Stack
      direction="row"
      align="center"
      gap="none"
      // The loading state carries its own `status` role.
      role={placeholder.kind === "failed" ? "alert" : undefined}
      data-tree-placeholder={placeholder.kind}
      // `relative`: the positioning context the guides are placed in.
      className="relative min-h-7 gap-tree-row px-xs py-xs text-body"
      // The same indent split and gap as `TreeRowChrome` — density tokens, so
      // a theme's wider step moves the placeholder (and its guides) with its
      // siblings.
      style={treeRowIndentStyle(depth)}
    >
      {guides && <TreeGuides depth={depth} />}
      {/* The chevron slot's width, so the text starts on the label column. */}
      <span className="size-5" aria-hidden />
      {placeholder.kind === "loading" ? (
        // The shared loading state (delayed, so a fast listing never flashes),
        // flush in the row: the row already owns the inset.
        <Loading
          variant="spinner"
          label="Loading…"
          className="px-none py-none"
        />
      ) : placeholder.kind === "empty" ? (
        <Text tone="faint">Empty</Text>
      ) : (
        <>
          <Fill>
            <Text tone="destructive" title={placeholder.message}>
              {placeholder.message}
            </Text>
          </Fill>
          <Button
            variant="ghost"
            aspect="inline"
            onClick={placeholder.retry}
            className="px-2xs"
          >
            Retry
          </Button>
        </>
      )}
    </Stack>
  );
}
