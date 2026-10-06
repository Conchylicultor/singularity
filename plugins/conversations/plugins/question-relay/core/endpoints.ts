import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import {
  AnswerQuestionBodySchema,
  RegisterQuestionBodySchema,
  RelayResolutionSchema,
} from "./schemas";

/**
 * The relay registers the question its hook is holding. An idempotent upsert
 * on the tool-use id: a relay that reconnects after a backend restart
 * re-registers harmlessly, and gets back where the question stands.
 */
export const registerRelayQuestion = defineEndpoint({
  route: "POST /api/conversations/:id/questions",
  body: RegisterQuestionBodySchema,
  response: RelayResolutionSchema,
});

/**
 * Long-poll: held until the question leaves `open` or {@link AWAIT_HOLD_MS}
 * passes (then `open` again). Woken in-process by the write that resolves it —
 * no timer loop.
 */
export const awaitRelayQuestion = defineEndpoint({
  route: "GET /api/conversations/:id/questions/:toolUseId/await",
  response: RelayResolutionSchema,
  // Held on purpose: a slow await is the endpoint working, not a slow op.
  slowThresholdMs: 60_000,
});

/** Answer a held question from the web. 409 once it is no longer open. */
export const answerRelayQuestion = defineEndpoint({
  route: "POST /api/conversations/:id/questions/:toolUseId/answer",
  body: AnswerQuestionBodySchema,
});

/** "Answer in terminal": the relay lets go and the CLI draws its menu. */
export const releaseRelayQuestion = defineEndpoint({
  route: "POST /api/conversations/:id/questions/:toolUseId/release",
});

/**
 * The relay is being killed (Escape in the terminal SIGTERMs it): the CLI is
 * writing its own interrupt result, so the question is over.
 */
export const abandonRelayQuestion = defineEndpoint({
  route: "POST /api/conversations/:id/questions/:toolUseId/abandon",
});

/**
 * How long one await is held. Under the backend's 60 s Bun `idleTimeout`
 * (server-core/bin/index.ts), which would otherwise cut a silent request.
 */
export const AWAIT_HOLD_MS = 45_000;
