import { z } from "zod";

// The jsonb payload for a `conversation-session-divergence` report. One report
// per conversation (fingerprint `session-divergence:<conversationId>`); the row
// `count` says how many monitor ticks saw the divergence still standing.
//
// `chainTailSessionId` is what the poller believes the conversation is running
// under (the newest link of `conversation_sessions`); `liveSessionId` is a
// session id reachable from the pane — in its process subtree, or through a
// parked-job pointer out of it — that the chain has never heard of, whose
// transcript is being written *ahead* of the tail's. The two mtimes are the
// evidence: `liveMtimeMs - tailMtimeMs` is how far the invisible session has run
// past the last one the UI can render.
export const SessionDivergencePayloadSchema = z.object({
  conversationId: z.string(),
  chainTailSessionId: z.string(),
  liveSessionId: z.string(),
  tailMtimeMs: z.number(),
  liveMtimeMs: z.number(),
});
export type SessionDivergencePayload = z.infer<
  typeof SessionDivergencePayloadSchema
>;
