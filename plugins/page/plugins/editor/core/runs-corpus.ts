/**
 * The shared FUZZ CORPUS for the runs ↔ `Y.XmlText` ↔ Lexical mappings.
 *
 * Test-only: nothing in the shipped app imports this module, and it is
 * deliberately NOT re-exported from `core/index.ts`. It lives in `core/` (not
 * next to one of its consumers) because the two suites that need it sit on
 * opposite sides of a runtime boundary:
 *
 *  - `core/runs-yjs.test.ts` — the runs ↔ `Y.XmlText` round-trip;
 *  - `web/internal/block-text-extensions.test.ts` — the same corpus read back
 *    through a hydrated Lexical editor (`$xmlBasisContentLength`).
 *
 * `core` may only import `core`, so the generators cannot live in `web/`; and a
 * `.test.ts` file is not an import target (importing one would re-register its
 * `describe`s in the importing suite). Factoring them here is what keeps ONE
 * corpus behind both properties — a second copy would let the two suites drift
 * and silently stop testing the same inputs.
 */

import {
  $createParagraphNode,
  $getRoot,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import { LinkNode } from "@lexical/link";
import type { XmlText } from "yjs";
import { yDocContent, yDocFromLexical } from "@plugins/primitives/plugins/collab-doc/core";
import {
  COLOR_TOKENS,
  MARK_ORDER,
  type ColorToken,
  type Mark,
  type RichText,
} from "./rich-text";
import { $appendRuns, type RunsTokenExtension } from "./runs-lexical";
import type { RunsXmlTextOptions } from "./runs-yjs";

// ---------------------------------------------------------------------------
// Synthetic inline token decorator (mirrors page-link/inline-date/inline-math)
// ---------------------------------------------------------------------------
//
// The real decorator nodes are gated in their own plugins'
// `web/internal/collab-roundtrip.test.ts` — importing them here would invert the
// plugin dependency graph. This mirrors their exact shape: an inline decorator
// whose native `getTextContent()` is EMPTY, so its length is only ever recovered
// from `serializeNode`.

export class TokenNode extends DecoratorNode<null> {
  __tokenId: string;

  static getType(): string {
    return "test-token";
  }

  static clone(node: TokenNode): TokenNode {
    return new TokenNode(node.__tokenId, node.__key);
  }

  static importJSON(json: SerializedLexicalNode & { tokenId?: string }): TokenNode {
    return new TokenNode(json.tokenId ?? "");
  }

  constructor(tokenId = "", key?: NodeKey) {
    super(key);
    this.__tokenId = tokenId;
  }

  exportJSON(): SerializedLexicalNode & { tokenId: string } {
    return { type: "test-token", version: 1, tokenId: this.__tokenId };
  }

  isInline(): true {
    return true;
  }

  // Mirrors the real decorators: native text content stays empty; the token is
  // written by `serializeNode` only.
  getTextContent(): string {
    return "";
  }

  createDOM(): HTMLElement {
    throw new Error("createDOM must never be called headless");
  }

  updateDOM(): false {
    return false;
  }

  decorate(): null {
    return null;
  }

  getTokenId(): string {
    return this.__tokenId;
  }
}

export const tokenExtension: RunsTokenExtension = {
  deserializePattern: /\[\[(tok-[a-z0-9]+)\]\]/,
  createNodeFromMatch: (m) => new TokenNode(m[1]!),
  serializeNode: (n) => (n instanceof TokenNode ? `[[${n.getTokenId()}]]` : null),
};

/** The corpus's standard options: the synthetic token materialized as a node. */
export const tokenOpts: RunsXmlTextOptions = {
  extensions: [tokenExtension],
  nodes: [TokenNode],
};

// ---------------------------------------------------------------------------
// Generators (seeded — deterministic)
// ---------------------------------------------------------------------------

/** Tiny deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
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
 * One block's runs: 1–6 runs drawn from a fixed piece set, with random
 * marks/color/link. The piece set deliberately includes `[[tok-gen]]` (an inline
 * decorator, materialized as a node under {@link tokenOpts}) and soft `\n`
 * breaks — the two shapes where the naive length bases diverge.
 */
export function randomRuns(rand: () => number): RichText {
  const pieces = ["a", "bc", "hello", " ", "x y", "\n", "z\nw", "[[tok-gen]]", "é✨"];
  const colors = COLOR_TOKENS.filter(
    (c): c is Exclude<ColorToken, "default"> => c !== "default",
  );
  const n = 1 + Math.floor(rand() * 6);
  const runs: RichText = [];
  for (let i = 0; i < n; i++) {
    const text = pieces[Math.floor(rand() * pieces.length)]!;
    const run: { text: string; marks?: Mark[]; color?: ColorToken; link?: string } = {
      text,
    };
    const marks = MARK_ORDER.filter(() => rand() < 0.3);
    if (marks.length > 0) run.marks = [...marks];
    if (rand() < 0.25) run.color = colors[Math.floor(rand() * colors.length)]!;
    if (rand() < 0.2) run.link = "https://example.com/p";
    runs.push(run);
  }
  return runs;
}

/**
 * A MULTI-PARAGRAPH block: 1–4 paragraphs, each its own {@link randomRuns}.
 *
 * `runsToLexical` always builds exactly ONE paragraph (soft `\n` becomes a
 * `LineBreakNode` inside it), so a corpus generated from runs alone can never
 * exercise the paragraph boundary — and the paragraph join is one of the two
 * places the runs basis and the Yjs basis disagree. Hence a generator that
 * builds the paragraphs directly.
 */
export function randomParagraphs(rand: () => number): RichText[] {
  const n = 1 + Math.floor(rand() * 4);
  const paras: RichText[] = [];
  for (let i = 0; i < n; i++) paras.push(randomRuns(rand));
  return paras;
}

/**
 * Seed a fresh `Y.Doc` holding ONE PARAGRAPH PER ENTRY of `paras` and return its
 * content `Y.XmlText` — the multi-paragraph twin of `runsToXmlText`, built from
 * the same `$appendRuns` walk so each paragraph's inner shape is identical to
 * what the live editor would produce.
 */
export function paragraphsToXmlText(
  paras: readonly RichText[],
  opts: RunsXmlTextOptions = {},
): XmlText {
  const doc = yDocFromLexical(
    () => {
      const root = $getRoot();
      root.clear();
      for (const runs of paras) {
        // `$appendRuns` targets the LAST element child, so appending an empty
        // paragraph first makes it the destination for this entry's runs.
        root.append($createParagraphNode());
        $appendRuns(runs, opts.extensions ?? []);
      }
    },
    { nodes: [LinkNode, ...(opts.nodes ?? [])], clientID: opts.clientID },
  );
  return yDocContent(doc);
}
