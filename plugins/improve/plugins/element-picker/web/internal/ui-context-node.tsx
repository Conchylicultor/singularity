import type { ReactNode } from "react";
import { DecoratorNode, type LexicalNode, type NodeKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { UiContextMeta } from "../../core";
import { UiContextChip } from "../components/ui-context-chip";

type SerializedUiContextNode = {
  type: "ui-context";
  version: 1;
  meta: UiContextMeta;
};

export class UiContextNode extends DecoratorNode<ReactNode> {
  __meta: UiContextMeta;

  static getType(): string {
    return "ui-context";
  }

  static clone(node: UiContextNode): UiContextNode {
    return new UiContextNode(node.__meta, node.__key);
  }

  constructor(meta: UiContextMeta, key?: NodeKey) {
    super(key);
    this.__meta = meta;
  }

  static importJSON(json: SerializedUiContextNode): UiContextNode {
    return new UiContextNode(json.meta);
  }

  exportJSON(): SerializedUiContextNode {
    return {
      type: "ui-context",
      version: 1,
      meta: this.__meta,
    };
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

  getMeta(): UiContextMeta {
    return this.__meta;
  }

  decorate(): ReactNode {
    return <UiContextNodeView nodeKey={this.__key} meta={this.__meta} />;
  }
}

function UiContextNodeView({
  nodeKey,
  meta,
}: {
  nodeKey: NodeKey;
  meta: UiContextMeta;
}) {
  const [editor] = useLexicalComposerContext();
  const isEditable = editor.isEditable();
  return (
    <UiContextChip
      meta={meta}
      onRemove={
        isEditable
          ? () => {
              editor.update(() => {
                const node = editor.getEditorState()._nodeMap.get(nodeKey);
                if (node) (node as LexicalNode).remove();
              });
            }
          : undefined
      }
    />
  );
}

export function $createUiContextNode(meta: UiContextMeta): UiContextNode {
  return new UiContextNode(meta);
}

export function $isUiContextNode(
  node: LexicalNode | null | undefined,
): node is UiContextNode {
  return node instanceof UiContextNode;
}
