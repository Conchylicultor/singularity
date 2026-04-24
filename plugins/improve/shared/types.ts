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

export interface ImproveConfig {
  promptTemplate: string;
}

export const DEFAULT_PROMPT_TEMPLATE = `{{text}}

---
Context:
- URL: {{url}}
- Attachments: {{attachments}}
`;
