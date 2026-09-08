import { MdAutoAwesome } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface ModelPayload {
  type: "model";
  identity?: {
    modelId?: string;
    marketingName?: string;
    knowledgeCutoff?: string;
  };
  /** The sentence the harness injected. Ignored: it only restates `identity`,
   *  and the row already shows the parts in a form a reader can scan. */
  text?: string;
}

/**
 * Which model the harness put behind this session. One fact, so a line and not
 * a card — a `CollapsibleCard` whose body only restated its own label would be
 * noise.
 *
 * The marketing name is the row's one emphasized value (it is what a reader
 * recognises); the exact id follows in mono because that is the string anyone
 * comparing two sessions actually needs, and it is the only thing that
 * distinguishes two releases sharing a name.
 */
export function ModelView({ event }: AttachmentRendererProps) {
  const payload = event.attachment as ModelPayload;
  const { modelId, marketingName, knowledgeCutoff } = payload.identity ?? {};
  const name = marketingName ?? modelId;
  if (!name) {
    throw new Error("model attachment carries no `identity.modelId`");
  }

  return (
    <EventLine icon={<MdAutoAwesome className="size-3.5" />} label="Model">
      <span className="truncate text-foreground">{name}</span>
      {modelId && modelId !== name && (
        <span className="truncate font-mono">{modelId}</span>
      )}
      {knowledgeCutoff && (
        <span className="truncate">· knowledge cutoff {knowledgeCutoff}</span>
      )}
    </EventLine>
  );
}
