import { useEffect } from "react";
import type { ConversationEvent } from "@plugins/conversations/shared/protocol";
import { getConversationStream } from "./client";

export function useConversationStream(
  handler: (event: ConversationEvent) => void,
): void {
  useEffect(() => {
    const stream = getConversationStream();
    return stream.subscribe(handler);
  }, [handler]);
}
