import { z } from "zod";

// The jsonb payload for a `conversation-session-divergence` report. One report
// per conversation (fingerprint `session-divergence:<conversationId>`); the row
// `count` says how many monitor ticks saw the divergence still standing.
//
// `chainTailSessionId` is what the poller believes the conversation is running
// under (the newest link of `conversation_sessions`); `liveSubtreeSessionId` is
// a session id found in the pane's own process subtree that the chain has never
// heard of, whose transcript is being written *ahead* of the tail's. The two
// mtimes are the evidence: `liveMtimeMs - tailMtimeMs` is how far the invisible
// session has run past the last one the UI can render.
export const SessionDivergencePayloadSchema = z.object({
  conversationId: z.string(),
  chainTailSessionId: z.string(),
  liveSubtreeSessionId: z.string(),
  tailMtimeMs: z.number(),
  liveMtimeMs: z.number(),
});
export type SessionDivergencePayload = z.infer<
  typeof SessionDivergencePayloadSchema
>;
