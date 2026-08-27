/**
 * `$spliceRunsInto` with a token extension set: the alignment must treat a
 * materialized decorator as an ordinary unit keyed on its TOKEN, so an
 * unchanged chip keeps its node (and with it its CRDT item) while a changed
 * middle re-materializes one.
 *
 * Headless Lexical under Bun — the corpus's decorator never renders.
 * Run: `./singularity test plugins/page/plugins/markdown-apply`.
 */

import { describe, expect, test } from "bun:test";
import {
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  createEditor,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { LinkNode } from "@lexical/link";
import {
  coalesce,
  COLOR_TOKENS,
  MARK_ORDER,
  runsToLexical,
  serializeBlockRuns,
  type ColorToken,
  type Mark,
  type RichText,
} from "@plugins/page/plugins/editor/core";
import { tokenExtension } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";
import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import { $spliceRunsInto } from "./runs-splice";

// ---------------------------------------------------------------------------
// The fuzz corpus, mirrored rather than imported
// ---------------------------------------------------------------------------
//
// `page/editor/core/runs-corpus.ts` is the shared one, and it is deliberately
// NOT re-exported from that plugin's `core` barrel (its own header says so) —
// so from here it is only reachable through a deep cross-plugin path, which the
// boundary rules forbid. What is copied is therefore the generator and the
// synthetic family's SHAPE, both declared through the same shipped primitives
// (`defineInlineTokenNode` / `tokenExtension`), so this exercises the real node
// synthesis rather than an imitation of it.

type CorpusTokenFields = { tokenId: string };

const corpusTokenNode = defineInlineTokenNode<CorpusTokenFields>({
  type: "test-token",
  fields: ["tokenId"],
  token: ({ tokenId }) => `[[${tokenId}]]`,
  fieldsOf: (m) => ({ tokenId: m[1]! }),
  // Native text content stays EMPTY, mirroring the real page decorators: the
  // token's length is only ever recovered from the extension's serializer, so a
  // walk that forgot the extensions would silently drop it.
  textContent: "empty",
});

const corpusTokenExtension = tokenExtension({
  id: "test-token",
  pattern: /\[\[(tok-[a-z0-9]+)\]\]/,
  node: corpusTokenNode,
});

const TokenNode = corpusTokenNode.Node;
const extensions = [corpusTokenExtension];

/** Tiny deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One block's runs. The piece set deliberately includes `[[tok-gen]]` (a token,
 * materialized as a node under {@link extensions}), a `code`-marked-able token
 * and soft `\n` breaks — the shapes where the unit walks diverge.
 */
function randomRuns(rand: () => number): RichText {
  const pieces = [
    "a",
    "bc",
    "hello",
    " ",
    "x y",
    "\n",
    "z\nw",
    "[[tok-gen]]",
    "[[tok-two]] tail",
    "é✨",
  ];
  const colors = COLOR_TOKENS.filter(
    (c): c is Exclude<ColorToken, "default"> => c !== "default",
  );
  const n = 1 + Math.floor(rand() * 6);
  const runs: RichText = [];
  for (let i = 0; i < n; i++) {
    const text = pieces[Math.floor(rand() * pieces.length)]!;
    const run: {
      text: string;
      marks?: Mark[];
      color?: ColorToken;
      link?: string;
    } = { text };
    const marks = MARK_ORDER.filter(() => rand() < 0.3);
    if (marks.length > 0) run.marks = [...marks];
    if (rand() < 0.25) run.color = colors[Math.floor(rand() * colors.length)]!;
    if (rand() < 0.2) run.link = "https://example.com/p";
    runs.push(run);
  }
  return runs;
}

function makeEditor(runs: RichText): LexicalEditor {
  const editor = createEditor({
    namespace: "runs-splice-test",
    nodes: [LinkNode, TokenNode],
    onError: (e) => {
      throw e;
    },
  });
  editor.update(() => runsToLexical(runs, extensions), { discrete: true });
  return editor;
}

function splice(editor: LexicalEditor, runs: RichText): void {
  editor.update(() => $spliceRunsInto(runs, extensions), { discrete: true });
}

/** Every decorator leaf in the document, as `[nodeKey, tokenText]` pairs. */
function decorators(editor: LexicalEditor): [string, string][] {
  const out: [string, string][] = [];
  editor.getEditorState().read(() => {
    const walk = (node: LexicalNode): void => {
      if ($isElementNode(node)) {
        for (const child of node.getChildren()) walk(child);
        return;
      }
      if ($isTextNode(node) || $isLineBreakNode(node)) return;
      out.push([node.getKey(), corpusTokenExtension.serializeNode(node) ?? ""]);
    };
    for (const child of $getRoot().getChildren()) walk(child);
  });
  return out;
}

describe("$spliceRunsInto with token extensions", () => {
  test("changing the text AROUND a token preserves the decorator's node key", () => {
    const editor = makeEditor([{ text: "alpha [[tok-x]] omega" }]);
    const before = decorators(editor);
    expect(before).toEqual([[before[0]![0], "[[tok-x]]"]]);

    const next: RichText = [{ text: "alphaX [[tok-x]] omega" }];
    splice(editor, next);

    // The SAME node object survived the splice — which is what keeps its CRDT
    // item, and therefore the chip, alive through an agent edit.
    expect(decorators(editor)).toEqual(before);
    expect(serializeBlockRuns(editor, extensions)).toEqual(coalesce(next));
  });

  test("a token in the CHANGED middle re-materializes as a node", () => {
    const editor = makeEditor([{ text: "alpha [[tok-x]] omega" }]);
    const beforeKey = decorators(editor)[0]![0];

    const next: RichText = [{ text: "alpha [[tok-y]] omega" }];
    splice(editor, next);

    const after = decorators(editor);
    expect(after.map(([, token]) => token)).toEqual(["[[tok-y]]"]);
    // A different token is a different unit, so the middle was rebuilt — the
    // rebuild must produce a NODE, not the characters that spell it.
    expect(after[0]![0]).not.toBe(beforeKey);
    expect(serializeBlockRuns(editor, extensions)).toEqual(coalesce(next));
  });

  test("a token appearing where there was none becomes a node", () => {
    const editor = makeEditor([{ text: "plain text" }]);
    expect(decorators(editor)).toEqual([]);

    const next: RichText = [{ text: "plain [[tok-z]] text" }];
    splice(editor, next);

    expect(decorators(editor).map(([, token]) => token)).toEqual(["[[tok-z]]"]);
    expect(serializeBlockRuns(editor, extensions)).toEqual(coalesce(next));
  });

  test("removing a token's characters removes the node", () => {
    const editor = makeEditor([{ text: "alpha [[tok-x]] omega" }]);
    splice(editor, [{ text: "alpha omega" }]);
    expect(decorators(editor)).toEqual([]);
    expect(serializeBlockRuns(editor, extensions)).toEqual(
      coalesce([{ text: "alpha omega" }]),
    );
  });

  test("a code-marked run keeps its token as characters, on both sides", () => {
    // `matchTokens` yields nothing for a `code` run, so `lineNodes` builds no
    // node — and the splice's own unit walk must agree, or it would align a
    // token unit against a text one.
    const runs: RichText = [{ text: "[[tok-x]]", marks: ["code"] }];
    const editor = makeEditor(runs);
    expect(decorators(editor)).toEqual([]);

    const next: RichText = [{ text: "[[tok-x]] tail", marks: ["code"] }];
    splice(editor, next);
    expect(decorators(editor)).toEqual([]);
    expect(serializeBlockRuns(editor, extensions)).toEqual(coalesce(next));
  });

  test("fuzz: a splice lands exactly what a fresh seed of the same runs would", () => {
    // The reference is a REBUILD, not `coalesce(to)`: the runs↔Lexical mapping
    // emits a `LineBreakNode` as an unmarked run, so a marked run carrying a
    // soft `\n` legitimately comes back as three runs however it was built.
    // What the splice owes is that its incremental path and the wholesale one
    // agree — that is the property, and it is the one an agent edit depends on.
    const rand = prng(0x5eed);
    for (let i = 0; i < 400; i++) {
      const from = randomRuns(rand);
      const to = randomRuns(rand);

      const editor = makeEditor(from);
      splice(editor, to);

      expect(serializeBlockRuns(editor, extensions)).toEqual(
        serializeBlockRuns(makeEditor(to), extensions),
      );
      // And every token in `to` is a NODE, never the characters that spell it.
      expect(decorators(editor).map(([, token]) => token)).toEqual(
        decorators(makeEditor(to)).map(([, token]) => token),
      );
    }
  });
});
