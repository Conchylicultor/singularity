import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ClaudeCliCallSchema } from "./resources";

/**
 * The answer to "which model calls produced this record?" — a discriminated
 * result, never a bare array, because an empty array would collapse three
 * genuinely different answers a consumer must render differently:
 *
 * - `calls`        — here they are.
 * - `none`         — this record never made a model call. For a cheap cache-hit
 *                    run that deliberately skipped the expensive phase, this is
 *                    the CORRECT and expected outcome, not a gap.
 * - `not-retained` — it did make one, but the call log is a global ring of the
 *                    most recent N calls and has since trimmed it. The text is
 *                    gone; saying so is the honest answer.
 *
 * `[]` for all three would render "no model call" over a run whose prompt merely
 * aged out — a wrong explanation, silently. That is exactly what the repo's
 * `no-absorbed-failure` rule exists to prevent (same shape as
 * `RefreshSourceResultSchema` in `events-core`).
 */
export const ClaudeCliCallsResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("calls"), calls: z.array(ClaudeCliCallSchema) }),
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("not-retained") }),
]);
export type ClaudeCliCallsResult = z.infer<typeof ClaudeCliCallsResultSchema>;

/**
 * `occurredAt` is when the asking record happened (a run's `startedAt`, a task's
 * creation). It is what makes `not-retained` distinguishable from `none`: without
 * it the reader cannot tell "never called" from "called before the retention
 * horizon", so an omitted `occurredAt` always reports `none`.
 *
 * It crosses the wire as a `Date.toString()` — second granularity, which is far
 * finer than the horizon (the oldest of N retained calls, typically hours old).
 */
export const listClaudeCliCallsFor = defineEndpoint({
  route: "GET /api/claude-cli/calls",
  query: z.object({
    correlationId: z.string(),
    occurredAt: z.coerce.date().optional(),
  }),
  response: ClaudeCliCallsResultSchema,
});
