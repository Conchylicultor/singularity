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
  InlineToken: defineServerContribution<{ pattern: RegExp }>("page.inline-token", {
    docLabel: (t) => t.pattern.source,
  }),
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
 * `blockTextProtectedSpans()`. An inline decorator token (`[[block-…]]`,
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
