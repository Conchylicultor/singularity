import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { BlockHandle } from "../../core";

// Server-reachable `type → handle` registry. `Editor.Block` is a WEB-only dispatch
// slot, so nothing on the server could resolve a block type's `data` schema; each
// block-type plugin contributes its handle here so the write boundary can validate.
//
// No eager self-registering index (unlike `fields`'s `Fields.Storage`): that mirror
// exists only because `resolveFieldStorage` runs at module-eval inside `defineEntity`,
// BEFORE `collectContributions`. Block validation runs at REQUEST time, long after the
// boot-time collect pass has populated the live registry — so the plain token suffices.
// Do not "restore" an eager map.
export const Editor = {
  /** Per-type `data` schema. Contribute the block handle; keyed by `type`. */
  BlockData: defineServerContribution<BlockHandle<unknown>>("page.block-data", {
    docLabel: (h) => h.type,
  }),

  /**
   * One inline decorator token's text pattern — the server twin of the web-only
   * `registerBlockTextExtension`. It carries the `pattern` ONLY: the Lexical
   * halves (`createNodeFromMatch` / `serializeNode`) build editor nodes, which
   * exist only in the browser, while the pattern is pure data both runtimes need.
   *
   * Each contributor references the SAME exported constant from its own `core/`
   * as its web registration does, so the two registries read one source and
   * cannot drift — which is why there is no parity check here.
   */
  InlineToken: defineServerContribution<{ pattern: RegExp }>(
    "page.inline-token",
    {
      docLabel: (t) => t.pattern.source,
    },
  ),

  /**
   * A supplier of `markdown.tag.annotated` attribute values — the facts a block
   * tag carries that do NOT live in the block's `data` (a TODO card's linked
   * task id and that task's status live in another table keyed by block id).
   *
   * `resolve` is handed the rows a markdown read is about to walk and answers
   * with a block id → attribute record map, holding only the blocks it has
   * something to say about. A provider that recognizes none of the rows answers
   * with an empty map and does no work; the whole registry being empty means the
   * read pays nothing at all.
   *
   * It takes the rows in one call rather than one call per block on purpose: a
   * provider's natural query is a single `WHERE parent_id IN (…)`, bounded by
   * the page, and a per-block seam would turn a page read into N round trips.
   */
  BlockAnnotation: defineServerContribution<{
    resolve(
      rows: readonly { id: string; type: string }[],
    ): Promise<ReadonlyMap<string, Record<string, string>>>;
  }>("page.block-annotation"),
};

/**
 * Resolve the block handle for a `type`, or `undefined` if no plugin contributed one.
 * Two plugins claiming one `type` is a defect (last-write-wins would silently mask a
 * schema collision), so a duplicate registration throws loudly, naming the offenders.
 */
export function resolveBlockHandle(
  type: string,
): BlockHandle<unknown> | undefined {
  const matches = Editor.BlockData.getContributions().filter(
    (h) => h.type === type,
  );
  if (matches.length > 1) {
    const owners = matches.map((h) => h._pluginId ?? "<unknown>").join(", ");
    throw new Error(
      `Duplicate Editor.BlockData registration for block type "${type}" from: ${owners}. ` +
        `A block type's data schema must be owned by exactly one plugin.`,
    );
  }
  return matches[0];
}

/**
 * The registered token patterns, as the `MarkdownContext.protectedSpans` the
 * markdown conversion requires — the server twin of the web's
 * `blockTextProtectedSpans()`. An inline decorator token (`[[page:…]]`,
 * `[[date:…]]`, `\(latex\)`) is a plain substring inside `TextRun.text`, so the
 * marks-aware inline scan must be told to leave those bytes alone; inline LaTeX
 * is full of `_` and `*`. Without it, server-side serialization corrupts every
 * token it walks over.
 *
 * Read at call time, never memoized: mirrors the web accessor, and a snapshot
 * taken before `collectContributions` would silently degrade to no protection.
 *
 * The patterns are shared module constants, so a `g` flag would make `lastIndex`
 * a cross-call side channel. Nothing here mutates one: the contributed patterns
 * are flagless, and `maskProtected` (`core/inline-markdown.ts`, the sole
 * consumer) re-creates each one from `.source` with `g` before scanning.
 */
export function blockTextProtectedSpans(): RegExp[] {
  return Editor.InlineToken.getContributions().map((t) => t.pattern);
}

/**
 * Every registered provider's answer for `rows`, merged into one block id →
 * attribute record map — what a markdown read stamps onto its nodes as
 * `MarkdownNode.annotations`.
 *
 * Read at call time, never memoized, for the same reason `blockTextProtectedSpans`
 * is: a snapshot taken before `collectContributions` would silently degrade to
 * "no annotations", which reads exactly like a TODO nobody has dispatched.
 *
 * Providers run CONCURRENTLY — they are independent queries over the same rows —
 * and two of them claiming one `(block, attribute)` pair is a defect, not a
 * last-write-wins: the value a document shows would depend on contribution
 * order, and the two owners would each believe they own it. So it throws,
 * naming both.
 */
export async function resolveBlockAnnotations(
  rows: readonly { id: string; type: string }[],
): Promise<ReadonlyMap<string, Record<string, string>>> {
  const providers = Editor.BlockAnnotation.getContributions();
  const merged = new Map<string, Record<string, string>>();
  if (providers.length === 0) return merged;

  const answers = await Promise.all(
    providers.map(async (p) => ({
      owner: p._pluginId ?? "<unknown>",
      byBlock: await p.resolve(rows),
    })),
  );

  /** `blockId → attribute → the plugin that already claimed it`. */
  const claimedBy = new Map<string, Map<string, string>>();
  for (const { owner, byBlock } of answers) {
    for (const [blockId, record] of byBlock) {
      for (const [name, value] of Object.entries(record)) {
        let claims = claimedBy.get(blockId);
        if (!claims) {
          claims = new Map();
          claimedBy.set(blockId, claims);
        }
        const previous = claims.get(name);
        if (previous !== undefined) {
          throw new Error(
            `Two Editor.BlockAnnotation providers claim the \`${name}\` attribute of block ` +
              `${blockId}: ${previous} and ${owner}. An externally-owned attribute must have ` +
              "exactly one owner.",
          );
        }
        claims.set(name, owner);
        let target = merged.get(blockId);
        if (!target) {
          target = {};
          merged.set(blockId, target);
        }
        target[name] = value;
      }
    }
  }
  return merged;
}
