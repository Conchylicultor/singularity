import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { SshFailureKindSchema } from "@plugins/infra/plugins/ssh/core";
import {
  AnalyticsQueryResultSchema,
  AnalyticsQuerySchema,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";

export const DeploymentAnalyticsBodySchema = z
  .object({ deploymentId: z.string().min(1), query: AnalyticsQuerySchema })
  .strict();
export type DeploymentAnalyticsBody = z.infer<
  typeof DeploymentAnalyticsBodySchema
>;

/** curl's own exit codes a failed remote request is explained by. */
export const CURL_EXIT = {
  /** Nothing listening on the loopback port: the install is down. */
  couldNotConnect: 7,
  /** HTTP status >= 400 (`-f`): typically 404, the site ships no analytics yet. */
  httpError: 22,
  /** `-m` deadline passed: the report query took too long. */
  timedOut: 28,
} as const;

/**
 * What asking a deployment for its analytics answered. Every member is a state
 * the dashboard renders — none of them is an empty report:
 *
 * - `report` / `refused` — the box answered (collect's own result, verbatim).
 * - `no-ssh-key` — the server has no SSH key yet.
 * - `unverified` — the server's host key was never pinned: the connection check
 *   has not succeeded once, so the box's identity is unknown.
 * - `ssh-failed` — SSH itself failed (unreachable, auth, host key changed…).
 * - `request-failed` — SSH worked; the curl on the box failed (`exitCode` is
 *   curl's, see {@link CURL_EXIT}).
 * - `unreadable-answer` — the box answered something that is not a report.
 */
export const DeploymentAnalyticsResultSchema = z.discriminatedUnion("kind", [
  ...AnalyticsQueryResultSchema.options,
  z.object({ kind: z.literal("no-ssh-key") }).strict(),
  z.object({ kind: z.literal("unverified") }).strict(),
  z
    .object({
      kind: z.literal("ssh-failed"),
      failure: SshFailureKindSchema,
      message: z.string(),
      stderr: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("request-failed"),
      exitCode: z.number().int().nullable(),
      stderr: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unreadable-answer"),
      /** Why parsing failed, and the head of what came back. */
      detail: z.string(),
    })
    .strict(),
]);
export type DeploymentAnalyticsResult = z.infer<
  typeof DeploymentAnalyticsResultSchema
>;

/**
 * Read a deployment's analytics report. A POST because the query is a
 * structured body; it changes nothing. Each call runs one SSH session, so the
 * route is capped — the dashboard asks once per range/filter change and on an
 * explicit refresh, never on a timer. 404 when the deployment does not exist.
 */
export const queryDeploymentAnalytics = defineEndpoint({
  route: "POST /api/deploy/analytics/query",
  body: DeploymentAnalyticsBodySchema,
  response: DeploymentAnalyticsResultSchema,
  concurrency: 2,
});
