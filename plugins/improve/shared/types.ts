export interface ImproveSubmitCard {
  text: string;
  // null = "queue": create the task but don't arm auto-start.
  launch: "sonnet" | "opus" | null;
}

export interface ImproveSubmitBody {
  // 1+ entries. Index 0 is the head (no blockers); each later card is blocked
  // by the previous one. URL/attachments attach to the head only.
  cards: ImproveSubmitCard[];
  url: string;
  attachmentIds: string[];
}

export interface ImproveSubmitResponse {
  taskIds: string[];
}
