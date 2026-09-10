import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { runsToXmlText, type RichText } from "../../core";
import { corpusTokenNode } from "../../core/runs-corpus";
import {
  blockTextRunsOptions,
  blockTextTokenExtension,
  registerBlockTextExtension,
} from "./block-text-extensions";
import { projectableRunsOf } from "./doc-sourced-runs";
import { spliceOpenBlockDoc, TEXT_REPLAY_ORIGIN } from "./block-text-write";

/**
 * Replay host A (`block-text-write.ts`): the splice onto an OPEN canonical doc
 * is minimal (unchanged units keep their CRDT items), lands under
 * `TEXT_REPLAY_ORIGIN`, integrates nothing for equal runs, and carries marks,
 * links and decorator tokens through.
 */

let unregisterToken: () => void = () => {};
beforeAll(() => {
  unregisterToken = registerBlockTextExtension(
    blockTextTokenExtension({
      id: "test-token",
      node: corpusTokenNode,
      pattern: /\[\[(tok-[a-z0-9]+)\]\]/,
      markdownSpan: "transparent",
      renderToken: ({ tokenId }) => tokenId,
    }),
  );
});
afterAll(() => unregisterToken());

/** The doc's runs, widened off the projection brand so `toEqual` can compare them. */
const runsIn = (doc: Y.Doc): RichText => projectableRunsOf(doc);

function seededDoc(runs: RichText): Y.Doc {
  const doc = runsToXmlText(runs, blockTextRunsOptions()).doc;
  if (!doc) throw new Error("seed XmlText is not attached to a doc");
  return doc;
}

/** Live (non-deleted) string content held by `client`'s items, in insertion order. */
function liveTextOf(doc: Y.Doc, client: number): string {
  const structs = doc.store.clients.get(client) ?? [];
  let out = "";
  for (const s of structs) {
    if (!(s instanceof Y.Item) || s.deleted) continue;
    const content = s.content;
    if (content instanceof Y.ContentString) out += content.str;
  }
  return out;
}

describe("spliceOpenBlockDoc", () => {
  test("applies under TEXT_REPLAY_ORIGIN and brings the doc to the runs", () => {
    const doc = seededDoc([{ text: "hello world" }]);
    const origins: unknown[] = [];
    doc.on("update", (_u: Uint8Array, origin: unknown) => origins.push(origin));
    spliceOpenBlockDoc({ doc }, [{ text: "hello there" }]);
    expect(origins).toEqual([TEXT_REPLAY_ORIGIN]);
    expect(runsIn(doc)).toEqual([{ text: "hello there" }]);
  });

  test("is minimal: unchanged text keeps its original items", () => {
    const doc = seededDoc([{ text: "hello world" }]);
    const [seedClient] = [...doc.store.clients.keys()];
    if (seedClient === undefined) throw new Error("seed doc has no client");
    expect(liveTextOf(doc, seedClient)).toBe("hello world");

    spliceOpenBlockDoc({ doc }, [{ text: "hello there" }]);

    // The prefix "hello " is still the seed client's own characters — never
    // re-minted by the replay — and only the changed tail came from the
    // headless replica (a second client).
    expect(liveTextOf(doc, seedClient)).toBe("hello ");
    const others = [...doc.store.clients.keys()].filter(
      (c) => c !== seedClient,
    );
    expect(others).toHaveLength(1);
    expect(liveTextOf(doc, others[0]!)).toBe("there");
  });

  test("equal runs integrate nothing", () => {
    const doc = seededDoc([{ text: "same", marks: ["bold"] }]);
    let updates = 0;
    doc.on("update", () => {
      updates += 1;
    });
    spliceOpenBlockDoc({ doc }, [{ text: "same", marks: ["bold"] }]);
    expect(updates).toBe(0);
  });

  test("marks, links and tokens survive a splice both ways", () => {
    const a: RichText = [
      { text: "bold ", marks: ["bold"] },
      { text: "[[tok-z9]]" },
      { text: " tail", link: "https://example.com" },
    ];
    const b: RichText = [
      { text: "bold ", marks: ["bold"] },
      { text: "[[tok-z9]]" },
      { text: " tail", link: "https://example.com" },
      { text: " plus", marks: ["italic"] },
    ];
    const doc = seededDoc(a);
    spliceOpenBlockDoc({ doc }, b);
    expect(runsIn(doc)).toEqual(b);
    spliceOpenBlockDoc({ doc }, a);
    expect(runsIn(doc)).toEqual(a);
  });

  test("a whole-content deletion leaves one empty paragraph", () => {
    const doc = seededDoc([{ text: "gone" }]);
    spliceOpenBlockDoc({ doc }, []);
    expect(runsIn(doc)).toEqual([]);
    spliceOpenBlockDoc({ doc }, [{ text: "back" }]);
    expect(runsIn(doc)).toEqual([{ text: "back" }]);
  });
});
