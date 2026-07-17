import { asPluginId, type PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { EdgeGraph } from "./types";

/**
 * A composition entry-point pattern: a dot-separated plugin id with an optional
 * leading `!` (negation) and an optional trailing `.**` (whole-subtree). No
 * mid-glob — only exact match, `.**` (subtree opt-in), and `!` (trim). See
 * {@link parseEntryPattern}.
 *
 * `**` / `!` are not valid `PluginId` characters, but nothing derives a
 * filesystem or config path from an entry point (paths come from the
 * composition's own id), so the string alias is operationally safe.
 */
export type EntryPattern = string;

/** A parsed {@link EntryPattern}: the negation flag, the exact base id, whether a
 *  `.**` whole-subtree suffix was present, and the original raw string. */
export interface ParsedPattern {
  negate: boolean;
  base: PluginId;
  subtree: boolean;
  raw: string;
}

/**
 * Parse an {@link EntryPattern} into its parts: strip a leading `!` (⇒ `negate`),
 * strip a trailing `.**` (⇒ `subtree`), and brand the remainder as the `base`
 * {@link PluginId}. The only grammar is a leading `!` and a trailing `.**`; the
 * base is treated as an exact id (no mid-glob).
 */
export function parseEntryPattern(p: string): ParsedPattern {
  const raw = p;
  let rest = p;
  const negate = rest.startsWith("!");
  if (negate) rest = rest.slice(1);
  const subtree = rest.endsWith(".**");
  if (subtree) rest = rest.slice(0, -".**".length);
  return { negate, base: asPluginId(rest), subtree, raw };
}

/**
 * The plugin ids a parsed pattern matches: its `base` plus (when `.**` was
 * present) the base's whole subtree. An unknown base — one with no `subtree`
 * entry in the graph — still matches `{base}` inertly, mirroring the engine's
 * existing unknown-id rule (an unknown seed passes through and contributes no
 * further edges).
 */
export function matchEntryPattern(p: ParsedPattern, graph: EdgeGraph): Set<PluginId> {
  const out = new Set<PluginId>([p.base]);
  if (p.subtree) for (const d of graph.subtree.get(p.base) ?? []) out.add(d);
  return out;
}
