import type { LexicalNode } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { imageNode } from "./markdown";
import { AttachmentThumbnail } from "../components/attachment-thumbnail";

export type ImageNodePayload = {
  attachmentId: string;
  alt?: string;
};

/**
 * The browser half of the pasted-image token: the SAME family declared in
 * `core/node.ts`, with rendering added.
 */
export const imageWebNode = imageNode.decorated({
  className: "inline-flex align-middle mx-0.5",
  render: ({ attachmentId, alt }, node) => (
    <ImageNodeView
      nodeKey={node.getKey()}
      attachmentId={attachmentId}
      alt={alt}
    />
  ),
});

/** The Lexical class to register in the text editor's `nodes` config. */
export const ImageNode = imageWebNode.Node;

function ImageNodeView({
  nodeKey,
  attachmentId,
  alt,
}: {
  nodeKey: string;
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

export function $createImageNode(payload: ImageNodePayload): LexicalNode {
  return imageWebNode.create({
    attachmentId: payload.attachmentId,
    alt: payload.alt ?? "",
  });
}
