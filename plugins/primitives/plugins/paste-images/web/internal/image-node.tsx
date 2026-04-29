import type { ReactNode } from "react";
import { DecoratorNode, type LexicalNode, type NodeKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { AttachmentThumbnail } from "../components/attachment-thumbnail";

export type ImageNodePayload = {
  attachmentId: string;
  alt?: string;
};

type SerializedImageNode = {
  type: "paste-image";
  version: 1;
  attachmentId: string;
  alt: string;
};

export class ImageNode extends DecoratorNode<ReactNode> {
  __attachmentId: string;
  __alt: string;

  static getType(): string {
    return "paste-image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__attachmentId, node.__alt, node.__key);
  }

  constructor(attachmentId: string, alt: string, key?: NodeKey) {
    super(key);
    this.__attachmentId = attachmentId;
    this.__alt = alt;
  }

  static importJSON(json: SerializedImageNode): ImageNode {
    return new ImageNode(json.attachmentId, json.alt);
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "paste-image",
      version: 1,
      attachmentId: this.__attachmentId,
      alt: this.__alt,
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

  getAttachmentId(): string {
    return this.__attachmentId;
  }

  getAlt(): string {
    return this.__alt;
  }

  decorate(): ReactNode {
    return <ImageNodeView nodeKey={this.__key} attachmentId={this.__attachmentId} alt={this.__alt} />;
  }
}

function ImageNodeView({
  nodeKey,
  attachmentId,
  alt,
}: {
  nodeKey: NodeKey;
  attachmentId: string;
  alt: string;
}) {
  const [editor] = useLexicalComposerContext();
  const isEditable = editor.isEditable();
  return (
    <AttachmentThumbnail
      attachmentId={attachmentId}
      alt={alt}
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

export function $createImageNode(payload: ImageNodePayload): ImageNode {
  return new ImageNode(payload.attachmentId, payload.alt ?? "");
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
