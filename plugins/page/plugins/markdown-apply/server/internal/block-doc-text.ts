import { LinkNode } from "@lexical/link";
import { applyUpdate, Doc, encodeStateAsUpdate, XmlElement, XmlText } from "yjs";
import { db } from "@plugins/database/server";
import {
  editYDocState,
  yDocContent,
} from "@plugins/primitives/plugins/collab-doc/core";
import {
  initBlockDoc,
  loadBlockDoc,
  mergeBlockDocUpdate,
} from "@plugins/page/plugins/editor-collab/server";
import {
  coalesce,
  runsToXmlText,
  xmlTextToRuns,
  type RichText,
} from "@plugins/page/plugins/editor/core";
import { $spliceRunsInto } from "./runs-splice";

/**
 * Writing a block's TEXT from the server, with no mounted editor.
 *
 * Text has exactly one owner — the block's per-block `Y.Doc` — so this is the
 * only channel a markdown apply may use for a surviving block. The row's
 * `data.text` is a projection written afterwards by the caller, downstream of
 * what happens here.
 *
 * ---------------------------------------------------------------------------
 * Extensions are empty, and that has one real consequence
 * ---------------------------------------------------------------------------
 *
 * Inline decorator tokens (`[[pageId]]`, `[[date:…]]`, `\(latex\)`) are stored
 * INSIDE `TextRun.text` as plain characters, so runs-level work needs no
 * extensions — which is why `protectedSpans` (pure data, contributed to
 * `Editor.InlineToken`) was enough to make markdown conversion server-safe.
 *
 * A doc a BROWSER wrote is a different matter: there the token is materialized
 * as a decorator NODE whose Lexical class lives in a web plugin, and there is no
 * server-side class to construct it from. `readStateRuns` refuses such a doc up
 * front, naming the token type — see the note there for why a stub registration
 * would be worse than the refusal. This bounds the gap precisely: `read_page` is
 * unaffected (it reads `data.text`, where the token IS text), and only an EDIT
 * to a block that actually contains one is refused. Closing it needs the server
 * twin of `registerBlockTextExtension`'s NODE half — the same shape Step 1 built
 * for `protectedSpans`, which does not exist yet.
 */

/**
 * Deterministic Yjs clientID for a seed doc — a byte-for-byte mirror of
 * `use-collab-block-doc.ts`'s `seedClientID` (FNV-1a over the canonical runs
 * JSON, a NUL, then the extension-set fingerprint), because the two must obey
 * ONE determinism contract: identical runs AND an identical extension set must
 * yield identical seed bytes, and a DIFFERENT extension set must yield a
 * different clientID so divergent seeds can only duplicate (a plain CRDT merge)
 * rather than corrupt by colliding item ids.
 *
 * The server's extension set is empty, so its fingerprint is `""` — and it
 * therefore deliberately does NOT match a browser's. That is the contract
 * working, not a bug: the two build structurally different seeds. It costs
 * nothing, because `initBlockDoc` is first-writer-wins and hands back the
 * AUTHORITATIVE state, so a loser adopts the winner's bytes instead of merging
 * its own (see {@link writeBlockText}).
 */
function seedClientID(runsJson: string, extIds: string): number {
  let h = 0x811c9dc5;
  const fold = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  fold(runsJson);
  fold("\0");
  fold(extIds);
  return h >>> 0;
}

/** Full seed-state bytes for `runs` (see {@link seedClientID}). */
function buildSeedState(runs: RichText): Uint8Array {
  const xmlText = runsToXmlText(runs, {
    clientID: seedClientID(JSON.stringify(runs), ""),
  });
  const doc = xmlText.doc;
  if (!doc) {
    throw new Error("buildSeedState: seed XmlText is not attached to a doc");
  }
  return encodeStateAsUpdate(doc);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * The decorator-node types this doc holds, by their `@lexical/yjs` encoding: an
 * element node is a `Y.XmlText`, a text node and a line break are `Y.Map`s, and
 * a DECORATOR is the only thing stored as a `Y.XmlElement`. So this is an exact
 * discriminator, read without hydrating anything.
 *
 * Checked BEFORE the hydration that would otherwise fail: `@lexical/yjs` throws
 * a bare `Node <type> is not registered` from three frames deep, and — worse —
 * a future stub registration would make it succeed while silently DELETING the
 * token (a synthesized class has no `getTextContent`, so the token serializes
 * to `""` and the splice writes that back). A refusal naming the token type is
 * the only answer that is neither cryptic nor lossy.
 */
function opaqueNodeTypes(doc: Doc): string[] {
  const found = new Set<string>();
  const visit = (node: XmlText): void => {
    for (const op of node.toDelta() as { insert?: unknown }[]) {
      const insert = op.insert;
      if (insert instanceof XmlText) visit(insert);
      else if (insert instanceof XmlElement) {
        const type = insert.getAttribute("__type");
        found.add(typeof type === "string" ? type : insert.nodeName);
      }
    }
  };
  visit(yDocContent(doc));
  return [...found];
}

/** The runs a stored doc state currently holds — the block's TRUE text. */
function readStateRuns(state: Uint8Array, blockId: string): RichText {
  const doc = new Doc();
  applyUpdate(doc, state);
  try {
    const opaque = opaqueNodeTypes(doc);
    if (opaque.length > 0) {
      throw new Error(
        `block ${blockId}'s content doc holds inline decorator node(s) [${opaque.join(", ")}] ` +
          `whose Lexical class exists only in the browser, so the server cannot read or ` +
          `rewrite this block's text without dropping them. Edit it from the editor, or ` +
          `give those token plugins a server-side node contribution (the NODE twin of the ` +
          `Editor.InlineToken pattern contribution).`,
      );
    }
    return xmlTextToRuns(yDocContent(doc));
  } finally {
    doc.destroy();
  }
}

/**
 * Field-positional rather than `JSON.stringify` of the objects: the two sides
 * come from different producers (a stored `jsonb` blob vs the Lexical walk), so
 * their key ORDER legitimately differs while the runs are identical — and a
 * false inequality here costs a pointless doc-update push.
 */
function canonicalRuns(runs: RichText): string {
  return JSON.stringify(
    coalesce(runs).map((r) => [r.text, r.marks ?? [], r.color ?? "", r.link ?? ""]),
  );
}

function runsEqual(a: RichText, b: RichText): boolean {
  return canonicalRuns(a) === canonicalRuns(b);
}

/**
 * Bring block `blockId`'s content doc to `runs`.
 *
 * Two entry states, one exit:
 *
 *  - **No stored doc** (a block nobody ever opened; its `data.text` is the only
 *    text there is) → seed it. `initBlockDoc` is first-writer-wins and RETURNS
 *    THE AUTHORITATIVE STATE, which is what closes the mount race by
 *    construction: if the bytes coming back are not the ones we sent, a browser
 *    seeded it first, so we drop our seed and continue down the edit path
 *    against the winner's state. Nothing is merged blind, so the two seeds can
 *    never both land.
 *  - **Stored doc** → read the TRUE current runs out of the doc (never the
 *    row's `data.text`, which trails it by ~1s) and splice in only what changed.
 *
 * Idempotent: a doc that already reads as `runs` is left completely alone — no
 * update, no push. That is what makes re-running a partially-applied markdown
 * apply converge instead of double-writing.
 */
export async function writeBlockText(
  blockId: string,
  runs: RichText,
): Promise<void> {
  const rows = await loadBlockDoc(db, blockId);
  const stored = rows[0];

  let state: Uint8Array;
  if (stored === undefined) {
    const seed = buildSeedState(runs);
    const authoritative = await initBlockDoc(db, blockId, seed);
    if (bytesEqual(authoritative, seed)) return; // we seeded it; already correct
    state = authoritative; // we lost the race — edit the winner's doc instead
  } else {
    state = Uint8Array.from(Buffer.from(stored.state, "base64"));
  }

  if (runsEqual(readStateRuns(state, blockId), runs)) return;

  const update = editYDocState(state, () => $spliceRunsInto(runs), {
    nodes: [LinkNode],
  });
  await mergeBlockDocUpdate(db, blockId, update);
}
