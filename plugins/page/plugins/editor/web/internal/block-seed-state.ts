import { encodeStateAsUpdate } from "yjs";
import { runsOf, runsToXmlText } from "../../core";
import { blockTextRunsOptions } from "./block-text-extensions";

/**
 * The `data.text` → seed-state bytes builder: what a block's content doc is
 * seeded from when the server holds no doc for it yet. One construction site,
 * shared by the live transport (`use-collab-block-doc.ts`, through the owner's
 * provider) and the stored-doc replay host (`block-text-write-stored.ts`), so
 * the two can never post different bytes for the same row text. A leaf — pure
 * yjs + the runs bridge — so the bun suite can read it.
 */

/**
 * Deterministic Yjs clientID for a seed doc, keyed on BOTH the runs content
 * AND the active extension set (FNV-1a over the canonical runs JSON plus a
 * canonical extension-id fingerprint, NUL-separated) — matching the
 * determinism contract on `RunsXmlTextOptions.clientID` in `core/runs-yjs.ts`.
 * Identical runs AND identical extension set → identical clientID → (with the
 * sequential single-client construction in `runsToXmlText`) byte-identical seed
 * encodings, so replicas seeding the same block independently converge by no-op
 * merge — which is what makes the provider's INSTANT local pre-seed safe
 * (Stage 4a). Folding the extension set in closes the mid-rollout hazard: two
 * replicas with DIFFERENT extension sets seeding the same block produce
 * structurally-different seed bytes, so they MUST NOT share a clientID (that
 * would collide item ids and corrupt). Different runs OR a mismatched extension
 * set now yields a different clientID, so a divergent seed can only ever
 * DUPLICATE (plain CRDT merge), never corrupt by colliding item ids.
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
  fold("\0"); // separator that can't appear inside a run-string collision
  fold(extIds);
  return h >>> 0;
}

/** Build deterministic seed-state bytes for `dataText` (see {@link seedClientID}). */
export function buildSeedStateFor(dataText: unknown): Uint8Array {
  const runs = runsOf(dataText);
  // The SAME option set the doc-sourced projection reads back with — a seed
  // written under one extension set and read under another loses its decorator
  // tokens (see `blockTextRunsOptions`).
  const opts = blockTextRunsOptions();
  // Canonical fingerprint of the active extension set: sorted ids, so the
  // clientID keys on the set's identity independent of registration order.
  const extIds = [...opts.extensions]
    .map((e) => e.id)
    .sort()
    .join(",");
  const xmlText = runsToXmlText(runs, {
    ...opts,
    clientID: seedClientID(JSON.stringify(runs), extIds),
  });
  const seedDoc = xmlText.doc;
  if (!seedDoc) {
    throw new Error("buildSeedStateFor: seed XmlText is not attached to a doc");
  }
  return encodeStateAsUpdate(seedDoc);
}
