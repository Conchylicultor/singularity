import { applyUpdate, encodeStateAsUpdate, type Doc } from "yjs";
import { LinkNode } from "@lexical/link";
import { editYDocState } from "@plugins/primitives/plugins/collab-doc/core";
import { $spliceRunsInto, type RichText } from "../../core";
import { blockTextRunsOptions } from "./block-text-extensions";

/**
 * Replay host A — the OPEN doc (`research/2026-09-09-page-data-based-text-undo-entries-v2.md`
 * §2.4). A data-based text undo entry records a block's runs before and after
 * an edit; replaying it means bringing the block's content doc to one of those
 * two run lists. When the block has a live {@link BlockDocOwner} this host
 * does it on the canonical `Y.Doc` directly, in process, with no network:
 *
 *  1. snapshot the canonical doc (`encodeStateAsUpdate` — no transaction);
 *  2. replay that snapshot into a headless Lexical editor and run the shared
 *     splice, `$spliceRunsInto` (`core/runs-splice.ts`): mark / link / token
 *     aware prefix-suffix alignment, so only the units that actually changed
 *     are rewritten and every untouched unit keeps its CRDT item;
 *  3. apply the resulting DELTA back onto the canonical doc under
 *     {@link TEXT_REPLAY_ORIGIN}.
 *
 * Applying the delta to the canonical is what fans the change out: the relay
 * (`binding-replica.ts`) forwards the origin verbatim into every mounted
 * binding's replica, `@lexical/yjs` renders it (the origin is not the binding),
 * and the transport provider queues it for flush (the origin is not the
 * provider). The run tracker (`block-run-tracker.ts`) IGNORES it — a replay is
 * not the user typing, so it must open no run and cannot be recorded twice.
 *
 * Pure yjs + Lexical, no fetch, no React — this file is the one the bun suite
 * imports. The stored-doc host (the one with `fetchEndpoint`) lives next door
 * in `block-text-write-stored.ts`.
 */

/**
 * The transaction origin of every replayed text write on a canonical doc. A
 * Symbol so it can collide with nothing: not the transport provider (whose
 * origin means "server-applied"), not a binding (whose origin means "the user
 * typed").
 */
export const TEXT_REPLAY_ORIGIN: unique symbol = Symbol(
  "page.editor.text-replay",
);

/** The slice of a block's owner this host needs: its canonical doc. */
export interface OpenBlockDoc {
  readonly doc: Doc;
}

/**
 * Bring `owner`'s canonical doc to `runs`, minimally, under
 * {@link TEXT_REPLAY_ORIGIN}. Synchronous: the delta is on the canonical — and
 * relayed into every mounted binding — when this returns. A no-op delta (the
 * doc already holds `runs`) still applies, integrating nothing and firing no
 * `update` event.
 */
export function spliceOpenBlockDoc(owner: OpenBlockDoc, runs: RichText): void {
  const opts = blockTextRunsOptions();
  const delta = editYDocState(
    encodeStateAsUpdate(owner.doc),
    () => $spliceRunsInto(runs, opts.extensions),
    { nodes: [LinkNode, ...opts.nodes] },
  );
  applyUpdate(owner.doc, delta, TEXT_REPLAY_ORIGIN);
}
