import type { Klass, LexicalNode } from "lexical";
import { LinkNode } from "@lexical/link";
import { XmlText } from "yjs";
import {
  readYDoc,
  yDocContent,
  yDocFromLexical,
} from "@plugins/primitives/plugins/collab-doc/core";
import type { RichText } from "./rich-text";
import type { InlineTokenExtension } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";
import { runsToLexical, serializeBlockRuns } from "./runs-lexical";

/**
 * THE runs ↔ `Y.XmlText` bridge — the only place that converts a block's
 * `RichText` runs to/from the Yjs representation `@lexical/yjs` binds to
 * (per-block CRDT plan, `research/2026-07-07-page-per-block-crdt-plan-b.md`).
 *
 * Both directions ride a headless Lexical editor through the generic
 * `collab-doc` primitive, reusing the exact `runs ↔ nodes` walk the live block
 * editor uses (`./runs-lexical.ts`) — a single source of truth for the mapping,
 * so what a seeded doc contains is byte-identical to what the live editor would
 * have produced.
 *
 * Token extensions (inline page-link / date / math decorators) are passed in by
 * the caller: the registry lives in the editor's web runtime, while headless
 * callers (server-side seeding) may pass none — tokens then stay embedded in
 * run text as plain characters, which is lossless at the runs level.
 */
export interface RunsXmlTextOptions {
  /** Inline token (de)serializers — the editor passes its registered set. */
  extensions?: readonly InlineTokenExtension[];
  /** Custom node classes the extensions materialize (decorator nodes). */
  nodes?: ReadonlyArray<Klass<LexicalNode>>;
  /**
   * Fixed Yjs clientID for the produced doc — makes the seed DETERMINISTIC:
   * identical runs (+ identical extension set) yield byte-identical update
   * encodings, so replicas seeding the same block independently converge by
   * no-op merge. Derive it from the runs content (see the seed path in
   * `use-collab-block-doc.ts`) so different runs never share item ids.
   */
  clientID?: number;
}

/**
 * Seed a fresh `Y.Doc` from runs and return its content `Y.XmlText` (the parent
 * doc is reachable via `xmlText.doc`).
 */
export function runsToXmlText(
  runs: RichText,
  opts: RunsXmlTextOptions = {},
): XmlText {
  const doc = yDocFromLexical(
    () => runsToLexical(runs, opts.extensions ?? []),
    { nodes: [LinkNode, ...(opts.nodes ?? [])], clientID: opts.clientID },
  );
  return yDocContent(doc);
}

/**
 * Read a content `Y.XmlText` back to normalized (`coalesce`d) runs — the
 * inverse of {@link runsToXmlText}. The XmlText must be the content root of its
 * `Y.Doc` (which is what `runsToXmlText` and the `@lexical/yjs` binding
 * produce); anything else fails loudly.
 */
/**
 * How much content a block's `Y.XmlText` holds, read straight off the CRDT — no
 * headless Lexical editor, unlike {@link xmlTextToRuns}, which builds one per
 * call. Deliberately a count and not runs: the caller
 * (`collab-text-plugin`'s hydration guard, run once per projection window per
 * dirty block) only ever compares it against ZERO — "does this doc hold anything
 * the editor is not showing" — and paying for a full replica to answer that
 * would put an editor construction on every typing burst.
 *
 * Characters for text, and **1 per embedded node**: a block holding one chip and
 * no prose is not empty, and counting only strings would make the guard read it
 * as a doc that never received anything.
 *
 * "Embedded node" is `@lexical/yjs`'s representation, which is coarser than the
 * word suggests — an inline page-link / date / math decorator is a
 * `Y.XmlElement`, a line break is an embedded `Y.Map`, and **every text node
 * carries a `Y.Map` of its own properties ahead of its string**. So this is NOT
 * a character count: `"hello"` is 6, not 5. It is a same-basis WITNESS, only
 * ever meaningful against another count taken in the same basis — either zero
 * (what the shipped hydration guard compares to) or the editor-side twin
 * `$xmlBasisContentLength` (`web/internal/block-text-extensions.ts`), which
 * mirrors this walk node for node. Re-basing either half onto "content only"
 * means re-basing BOTH, in lockstep.
 *
 * Counts LIVE content only — tombstones never appear in `toDelta()` — which is
 * the right basis: deleted text is not something the editor is failing to render.
 */
export function xmlTextContentLength(xmlText: XmlText): number {
  let total = 0;
  const walk = (node: XmlText): void => {
    for (const op of node.toDelta() as { insert: unknown }[]) {
      if (typeof op.insert === "string") total += op.insert.length;
      // Element children are the block's own paragraphs (recurse) or an
      // embedded decorator (one unit of content in its own right).
      else if (op.insert instanceof XmlText) walk(op.insert);
      else total += 1;
    }
  };
  walk(xmlText);
  return total;
}

export function xmlTextToRuns(
  xmlText: XmlText,
  opts: RunsXmlTextOptions = {},
): RichText {
  const doc = xmlText.doc;
  if (!doc) {
    throw new Error("xmlTextToRuns: XmlText is not attached to a Y.Doc");
  }
  if (yDocContent(doc) !== xmlText) {
    throw new Error("xmlTextToRuns: XmlText is not its doc's content root");
  }
  return readYDoc(
    doc,
    (editor) => serializeBlockRuns(editor, opts.extensions ?? []),
    { nodes: [LinkNode, ...(opts.nodes ?? [])] },
  );
}
