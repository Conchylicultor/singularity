export type JsonlEvent =
  | { kind: "user-text"; at: string; text: string }
  | {
      kind: "user-tool-result";
      at: string;
      toolUseId: string;
      content: string;
      isError?: boolean;
    }
  | {
      kind: "assistant-text";
      at: string;
      messageId?: string;
      text: string;
      stopReason?: string;
    }
  | {
      kind: "assistant-tool-use";
      at: string;
      messageId?: string;
      toolUseId: string;
      name: string;
      input: unknown;
    }
  | { kind: "system"; at: string; subtype?: string; text: string }
  | { kind: "summary"; at: string; text: string };

export interface JsonlEventsResponse {
  events: JsonlEvent[];
}
