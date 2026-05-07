import { useEffect, useRef } from "react";
import { setActiveRelateContext } from "@plugins/tasks/plugins/task-draft-form/web";
import { conversationPane } from "../panes";

export function ActiveRelateSync() {
  const { conversation } = conversationPane.useData();
  const ownerRef = useRef(Symbol());

  useEffect(() => {
    const owner = ownerRef.current;
    if (conversation.taskId) {
      setActiveRelateContext(owner, { taskId: conversation.taskId });
    }
    return () => setActiveRelateContext(owner, null);
  }, [conversation.taskId]);

  return null;
}
