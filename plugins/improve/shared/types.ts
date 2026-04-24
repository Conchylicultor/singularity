export interface ImproveSubmitBody {
  text: string;
  url: string;
  attachmentIds: string[];
  launch: "sonnet" | "opus" | null;
}

export interface ImproveSubmitResponse {
  taskId: string;
  conversationId: string | null;
}
