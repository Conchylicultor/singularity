import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { isNodeData, type TopLevelEntry } from "@plugins/reorder/web";
import type { BlockHandle } from "../../core";
import type { InsertAction } from "../types";

/**
 * A group of insertable block types the menus render together. A `label`-less
 * section is an unlabeled run (rendered with no eyebrow); a labeled section is a
 * `header` container from the reorder config tree.
 */
export interface BlockSection {
  label?: string;
  blocks: BlockHandle<unknown>[];
}

/** Read the `block` handle carried by an `Editor.Block` contribution entry. */
function blockOf(
  entry: Contribution | TopLevelEntry,
): BlockHandle<unknown> | undefined {
  if (isNodeData(entry)) return undefined;
  return (entry as { block?: BlockHandle<unknown> }).block;
}

/**
 * PURE transform: reorder `entries` (the `page.editor.block` slot's config tree
 * applied over the live contributions) → the grouped `BlockSection[]` the menus
 * render. Group-blind by design — the groups live only in the config file:
 *
 * - a `header` node becomes a labeled section (its `payload.label`), its members
 *   resolved to block handles;
 * - a run of loose top-level items becomes a label-less section (so the flat
 *   default config — no headers — yields today's single unlabeled list);
 * - spacer / unknown node types are ignored (menus draw no gaps);
 * - a block is KEPT only if it declares a menu `label` AND passes the
 *   `enabled` allowlist (the in-memory demo's curated palette); and
 * - an emptied section (all members filtered out) is dropped.
 */
export function entriesToSections(
  entries: TopLevelEntry[],
  enabled: readonly string[] | undefined,
): BlockSection[] {
  const keep = (b: BlockHandle<unknown>): boolean =>
    !!b.label && (!enabled || enabled.includes(b.type));

  const sections: BlockSection[] = [];
  let loose: BlockHandle<unknown>[] = [];

  const flushLoose = () => {
    if (loose.length > 0) sections.push({ blocks: loose });
    loose = [];
  };

  for (const entry of entries) {
    if (isNodeData(entry)) {
      if (entry.type !== "header") continue; // spacer / unknown → ignored
      flushLoose();
      const label =
        typeof entry.payload.label === "string"
          ? entry.payload.label
          : undefined;
      const blocks = (entry.members ?? [])
        .map(blockOf)
        .filter((b): b is BlockHandle<unknown> => !!b && keep(b));
      if (blocks.length > 0) sections.push({ label, blocks });
      continue;
    }
    const b = blockOf(entry);
    if (b && keep(b)) loose.push(b);
  }
  flushLoose();

  return sections;
}

/** Flatten grouped sections back to the plain block list (config order preserved). */
export function flattenSections(
  sections: BlockSection[],
): BlockHandle<unknown>[] {
  return sections.flatMap((s) => s.blocks);
}

/**
 * One row of an insert menu: a block type the caret's line converts into, or a
 * contributed `Editor.InsertAction` the line runs. Tagged rather than told apart
 * by shape, because the two commit differently and the menu must never guess.
 */
export type InsertEntry =
  | { kind: "block"; block: BlockHandle<unknown> }
  | { kind: "action"; action: InsertAction };

/** A group of insert-menu rows — `BlockSection`, with actions placed in it. */
export interface InsertSection<E extends InsertEntry = InsertEntry> {
  label?: string;
  entries: E[];
}

/** The block-type rows alone, as entries (the turn-into picker's list). */
export function blockEntries(
  sections: BlockSection[],
): InsertSection<Extract<InsertEntry, { kind: "block" }>>[] {
  return sections.map((s) => ({
    label: s.label,
    entries: s.blocks.map((block) => ({ kind: "block" as const, block })),
  }));
}

/**
 * PURE: place `actions` among the grouped block types. Each action is listed
 * right after the block type its `after` names, in that type's section, in
 * contribution order when several follow one type; an action with no `after`,
 * or whose `after` type is not offered here (unregistered, or filtered out by
 * the allowlist), goes to one trailing label-less section — never dropped, so a
 * renamed block type moves an action rather than hiding it.
 */
export function withInsertActions(
  sections: BlockSection[],
  actions: readonly InsertAction[],
): InsertSection[] {
  const offered = new Set(sections.flatMap((s) => s.blocks.map((b) => b.type)));
  const following = new Map<string, InsertAction[]>();
  const loose: InsertAction[] = [];
  for (const action of actions) {
    if (action.after !== undefined && offered.has(action.after)) {
      const list = following.get(action.after);
      if (list) list.push(action);
      else following.set(action.after, [action]);
    } else loose.push(action);
  }

  const out: InsertSection[] = sections.map((s) => ({
    label: s.label,
    entries: s.blocks.flatMap((block): InsertEntry[] => [
      { kind: "block", block },
      ...(following.get(block.type) ?? []).map((action): InsertEntry => ({
        kind: "action",
        action,
      })),
    ]),
  }));
  if (loose.length > 0) {
    out.push({
      entries: loose.map((action): InsertEntry => ({ kind: "action", action })),
    });
  }
  return out;
}

/** Flatten entry sections to the menu's keyboard index space (order preserved). */
export function flattenEntries<E extends InsertEntry>(
  sections: InsertSection<E>[],
): E[] {
  return sections.flatMap((s) => s.entries);
}
