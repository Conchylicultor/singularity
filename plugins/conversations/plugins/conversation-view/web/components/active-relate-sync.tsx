import { useEffect, useRef } from "react";
import { setActiveRelateContext } from "@plugins/tasks/plugins/task-draft-form/web";
import { useConversationById } from "@plugins/conversations/web";
import { conversationPane } from "../panes";

export function ActiveRelateSync() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const ownerRef = useRef(Symbol());

  useEffect(() => {
    const owner = ownerRef.current;
    if (conversation?.taskId) {
      setActiveRelateContext(owner, { taskId: conversation.taskId });
    }
    return () => setActiveRelateContext(owner, null);
  }, [conversation?.taskId]);

  return null;
}
