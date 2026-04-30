export interface ImproveSubmitCard {
  text: string;
  // null = "queue": create the task but don't arm auto-start.
  launch: "sonnet" | "opus" | null;
  // Per-card context — omit or leave empty to skip.
  url?: string;
  attachmentIds?: string[];
}

export interface ImproveSubmitBody {
  // 1+ entries. Index 0 is the head (no blockers); each later card is blocked
  // by the previous one. url/attachmentIds are per-card.
  cards: ImproveSubmitCard[];
  // Optional conversation group to add all created conversations to.
  groupId?: string;
}

export interface ImproveSubmitResponse {
  taskIds: string[];
}
