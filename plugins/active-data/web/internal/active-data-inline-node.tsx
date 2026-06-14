import type { ReactNode } from "react";
import { MdClose } from "react-icons/md";
import { DecoratorNode, type LexicalNode, type NodeKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
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
    return <ActiveDataInlineChip text={this.__text} nodeKey={this.__key} />;
  }
}

// Resolves the matching inline contribution and renders its component. Uses a
// full-string match (anchored) so a shorter pattern that merely appears *inside*
// a longer token (e.g. a `conv-…` id embedded in a `<ui-context …>` tag) never
// wins over the token that actually produced the node.
//
// Only ever rendered from `decorate()`, i.e. inside a `LexicalComposer`, so it
// can read the editor context. When the editor is editable it wraps the chip in
// a generic hover-reveal × removal affordance — every inline contribution gets
// it for free, with zero per-contributor wiring. Read surfaces render the
// contribution component directly (via linkify/segments), never through this
// node, so they never get the × (mirrors paste-images' ImageNode).
function ActiveDataInlineChip({ text, nodeKey }: { text: string; nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
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
  const chip = <Component content={text} attrs={{}} />;

  if (!editor.isEditable()) return chip;

  return (
    <span className="group relative inline-flex align-middle" contentEditable={false}>
      {chip}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          editor.update(() => {
            const node = editor.getEditorState()._nodeMap.get(nodeKey);
            if (node) (node as LexicalNode).remove();
          });
        }}
        className="bg-background/90 border-border text-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Remove"
      >
        <MdClose className="size-3" />
      </button>
    </span>
  );
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
