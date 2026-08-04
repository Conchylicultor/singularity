import type { Doc } from "yjs";
import { yDocContent } from "@plugins/primitives/plugins/collab-doc/core";
import { xmlTextToRuns, type RichText } from "../../core";
import { blockTextRunsOptions } from "./block-text-extensions";

/**
 * The provenance brand on the ONE value that may be persisted into
 * `page_blocks.data.text`.
 *
 * A block's text has exactly one owner — its per-block `Y.Doc` — and
 * `data.text` is a projection of it. The editor is a *view* of that doc which
 * can silently fall behind (`@lexical/yjs` ingests solely through the
 * `observeDeep` events fired AFTER its binding attaches, so a binding that
 * missed them renders empty forever while the doc keeps every character). A
 * projection sourced from the view can therefore write emptiness over the
 * owner, and empty runs are indistinguishable from a legitimately empty block:
 * an ABSORBABLE failure, and the one this brand makes unrepresentable.
 *
 * An ESLint rule cannot see provenance, so the enforcement is the type system —
 * the same class this codebase already uses for `PageForestTx`
 * (`server/internal/page-forest.ts`) and `RowData`'s `{ text?: never }`
 * (`core/row-data.ts`). {@link projectableRunsOf} is the only producer, and the
 * brand key is a module-private `unique symbol`, so the type is not even
 * *nameable* structurally outside this file: "the projection persisted a value
 * it did not read from the doc" is a tsc error.
 *
 * ## Why web-internal and not `core/`
 *
 * The sole producer needs the editor's registered token-extension set
 * (`blockTextRunsOptions`), which lives in the web runtime; the sole consumer is
 * `projectText` on the web block-editor context. A `core/` home would invite a
 * second producer with no registry — exactly the drift the single option-set
 * construction exists to prevent — and would widen the core barrel for a type no
 * cross-plugin consumer has any use for. Nothing outside this plugin can name
 * it, which is the point.
 */
declare const docSourced: unique symbol;
export type DocSourcedRuns = RichText & { readonly [docSourced]: true };

/**
 * The `content doc → data.text` projection writer's signature. Lives here, next
 * to the brand, so the context's `projectText` and the content-doc seam that
 * calls it cannot drift.
 */
export type ProjectTextFn = (blockId: string, runs: DocSourcedRuns) => void;

/**
 * Read `doc`'s content back to runs — the ONLY way to obtain
 * {@link DocSourcedRuns}.
 *
 * This is not a re-implementation of anything: `xmlTextToRuns` *is*
 * `readYDoc(doc, e => serializeBlockRuns(e, extensions), …)` — the same walk over
 * the same function object the live editor's own serialization uses, over a
 * headless replica of this doc. Producing runs by hand from `toDelta()` would
 * mean re-deriving marks/color from `CollabTextNode`'s property sync, link
 * nesting from an embedded `XmlText`, and decorator tokens from node instances
 * that must exist to be handed to `ext.serializeNode(node)` — the fork
 * `core/runs-yjs.ts` and `collab-doc`'s `headless-collab.ts` both explicitly
 * forbid, and a drift there is silent data loss on persist. Counting gets away
 * with a raw walk (`xmlTextContentLength`); producing runs does not.
 */
export function projectableRunsOf(doc: Doc): DocSourcedRuns {
  return xmlTextToRuns(yDocContent(doc), blockTextRunsOptions()) as DocSourcedRuns;
}
