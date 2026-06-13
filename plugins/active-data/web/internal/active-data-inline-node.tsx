import type { ReactNode } from "react";
import { DecoratorNode, type LexicalNode, type NodeKey } from "lexical";
import {
  UNSAFE_unsealSlotComponent,
  type SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, type ActiveDataInlineContribution } from "../slots";

type SerializedActiveDataInlineNode = {
  type: "active-data-inline";
  version: 1;
  text: string;
};

// One generic inline decorator for every active-data inline token. It stores the
// raw matched substring and resolves which contribution renders it at decorate
// time — so registering a `display:"inline"` contribution lights it up in the
// editor with zero per-tag Lexical wiring. Round-trips the raw text on
// serialize/copy (mirrors paste-images' ImageNode), so a chip pasted elsewhere
// re-deserializes via the same union pattern.
export class ActiveDataInlineNode extends DecoratorNode<ReactNode> {
  __text: string;

  static getType(): string {
    return "active-data-inline";
  }

  static clone(node: ActiveDataInlineNode): ActiveDataInlineNode {
    return new ActiveDataInlineNode(node.__text, node.__key);
  }

  constructor(text: string, key?: NodeKey) {
    super(key);
    this.__text = text;
  }

  static importJSON(json: SerializedActiveDataInlineNode): ActiveDataInlineNode {
    return new ActiveDataInlineNode(json.text);
  }

  exportJSON(): SerializedActiveDataInlineNode {
    return { type: "active-data-inline", version: 1, text: this.__text };
  }

  isInline(): true {
    return true;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "inline-flex align-middle mx-0.5";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getText(): string {
    return this.__text;
  }

  // Lexical builds the text/plain clipboard payload from each node's text
  // content; a bare DecoratorNode contributes "", which would drop the chip on
  // copy. Emitting the raw token lets any editor reconstruct it on paste.
  getTextContent(): string {
    return this.__text;
  }

  decorate(): ReactNode {
    return <ActiveDataInlineChip text={this.__text} />;
  }
}

// Resolves the matching inline contribution and renders its component. Uses a
// full-string match (anchored) so a shorter pattern that merely appears *inside*
// a longer token (e.g. a `conv-…` id embedded in a `<ui-context …>` tag) never
// wins over the token that actually produced the node.
function ActiveDataInlineChip({ text }: { text: string }) {
  const contributions = ActiveData.Tag.useContributions();
  const inline = contributions.filter(
    (c): c is SealContributions<ActiveDataInlineContribution> =>
      c.display === "inline",
  );
  const match = inline.find((c) =>
    new RegExp(`^(?:${c.pattern.source})$`, stripGlobal(c.pattern.flags)).test(
      text,
    ),
  );
  if (!match) return <>{text}</>;
  const Component = UNSAFE_unsealSlotComponent(match.component);
  return <Component content={text} attrs={{}} />;
}

function stripGlobal(flags: string): string {
  return flags.replace("g", "");
}

export function $createActiveDataInlineNode(text: string): ActiveDataInlineNode {
  return new ActiveDataInlineNode(text);
}

export function $isActiveDataInlineNode(
  node: LexicalNode | null | undefined,
): node is ActiveDataInlineNode {
  return node instanceof ActiveDataInlineNode;
}
