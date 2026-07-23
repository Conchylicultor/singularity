/**
 * Reading server-side per-block CRDT state from an e2e script.
 *
 * The decoder lives here because this plugin owns `page_block_docs`, the
 * `doc-init` / `doc-update` endpoints, and the `root`/`XmlText` document layout —
 * so when that layout changes, the tests that read it change in the same plugin.
 * Before the per-plugin move, four scripts carried a byte-identical copy, each
 * importing yjs through a hardcoded
 * `../plugins/page/plugins/editor/node_modules/yjs/dist/yjs.mjs` path that only
 * resolved because `e2e/` happened to be a sibling of `plugins/`. This plugin
 * declares `yjs` as a dependency, so the bare specifier below resolves by
 * ordinary walk-up no matter which plugin's script imports this barrel.
 */
import * as Y from "yjs";

/** Decode a base64 Yjs update into the plain text of its lexical `root`. */
export function blockDocText(stateB64: string): string {
  if (!stateB64) return "";
  const bytes = Uint8Array.from(Buffer.from(stateB64, "base64"));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  const root = doc.get("root", Y.XmlText);
  let text = "";
  for (const op of root.toDelta() as { insert?: unknown }[]) {
    if (op.insert instanceof Y.XmlText) {
      for (const run of op.insert.toDelta() as { insert?: unknown }[]) {
        if (typeof run.insert === "string") text += run.insert;
      }
    }
  }
  return text;
}

/**
 * Server truth for one block's CRDT doc, read through the live-state resource
 * endpoint. Returns undefined when no `page_block_docs` row exists yet — a
 * legitimate state (the block was just created and doc-init has not landed), so
 * callers distinguish "no row" from "row with empty text".
 */
export async function fetchBlockDoc(
  base: string,
  blockId: string,
): Promise<{ state: string } | undefined> {
  const res = await fetch(
    `${base}/api/resources/page-block-doc?blockId=${encodeURIComponent(blockId)}`,
  );
  if (!res.ok) {
    throw new Error(
      `page-block-doc ${blockId}: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as { value?: { state?: string }[] };
  const state = body.value?.[0]?.state;
  return state === undefined ? undefined : { state };
}

/** Convenience: server-side text for a block, `""` when no doc row exists yet. */
export async function fetchBlockDocText(
  base: string,
  blockId: string,
): Promise<string> {
  const doc = await fetchBlockDoc(base, blockId);
  return doc ? blockDocText(doc.state) : "";
}
