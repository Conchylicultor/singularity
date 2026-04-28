import type { ReactNode } from "react";
import { DecoratorNode, type LexicalNode, type NodeKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MdClose } from "react-icons/md";

export type ImageNodePayload = {
  id: string;
  mime: string;
  dataUrl: string;
};

type SerializedImageNode = {
  type: "prompt-image";
  version: 1;
  id: string;
  mime: string;
  dataUrl: string;
};

export class ImageNode extends DecoratorNode<ReactNode> {
  __id: string;
  __mime: string;
  __dataUrl: string;

  static getType(): string {
    return "prompt-image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__id, node.__mime, node.__dataUrl, node.__key);
  }

  constructor(id: string, mime: string, dataUrl: string, key?: NodeKey) {
    super(key);
    this.__id = id;
    this.__mime = mime;
    this.__dataUrl = dataUrl;
  }

  static importJSON(json: SerializedImageNode): ImageNode {
    return new ImageNode(json.id, json.mime, json.dataUrl);
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "prompt-image",
      version: 1,
      id: this.__id,
      mime: this.__mime,
      dataUrl: this.__dataUrl,
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

  getPayload(): ImageNodePayload {
    return { id: this.__id, mime: this.__mime, dataUrl: this.__dataUrl };
  }

  decorate(): ReactNode {
    return (
      <ImagePreview
        nodeKey={this.__key}
        mime={this.__mime}
        dataUrl={this.__dataUrl}
      />
    );
  }
}

function ImagePreview({
  nodeKey,
  mime,
  dataUrl,
}: {
  nodeKey: NodeKey;
  mime: string;
  dataUrl: string;
}) {
  const [editor] = useLexicalComposerContext();
  return (
    <span className="relative inline-block group" contentEditable={false}>
      <img
        src={dataUrl}
        alt="pasted image"
        title={mime}
        className="max-h-16 max-w-32 rounded border border-border object-cover"
        draggable={false}
      />
      <button
        type="button"
        onClick={() => {
          editor.update(() => {
            const node = editor.getEditorState()._nodeMap.get(nodeKey);
            if (node) (node as LexicalNode).remove();
          });
        }}
        className="absolute -top-1 -right-1 size-4 rounded-full bg-background/90 border border-border text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        aria-label="Remove image"
      >
        <MdClose className="size-3" />
      </button>
    </span>
  );
}

export function $createImageNode(payload: ImageNodePayload): ImageNode {
  return new ImageNode(payload.id, payload.mime, payload.dataUrl);
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
