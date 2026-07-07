import type { Klass, LexicalNode } from "lexical";
import { LinkNode } from "@lexical/link";
import type { XmlText } from "yjs";
import {
  readYDoc,
  yDocContent,
  yDocFromLexical,
} from "@plugins/primitives/plugins/collab-doc/core";
import type { RichText } from "./rich-text";
import {
  runsToLexical,
  serializeBlockRuns,
  type RunsTokenExtension,
} from "./runs-lexical";

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
  extensions?: readonly RunsTokenExtension[];
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
