import type {
  SshRunResult,
  SshTarget,
} from "@plugins/infra/plugins/ssh/server";
import {
  AnalyticsQueryResultSchema,
  analyticsQueryPath,
  type AnalyticsQuery,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import { LOOPBACK_HOST } from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import type { DeploymentAnalyticsResult } from "../../core";

/** curl's own deadline for the report, well under the SSH session's. */
export const CURL_MAX_SECONDS = 10;
/** The whole SSH attempt: connect + curl's deadline + slack. */
export const SSH_TIMEOUT_MS = 20_000;

/** How much of an unparseable answer is echoed back to the UI. */
const ANSWER_HEAD_CHARS = 300;

/**
 * The command run on the box. It targets the install's GATEWAY on its loopback
 * port, never the backend socket: `hostOnly` requires exactly the one proxy hop
 * the gateway appends, so this is the only path the report answers on. The
 * query travels base64url-encoded, which needs no quoting in the remote shell
 * `sshRun` joins its argv into.
 */
export function analyticsCurlArgv(
  loopbackPort: number,
  query: AnalyticsQuery,
): string[] {
  return [
    "curl",
    "-fsS",
    "-m",
    String(CURL_MAX_SECONDS),
    `http://${LOOPBACK_HOST}:${loopbackPort}${analyticsQueryPath(query)}`,
  ];
}

/** What the SSH layer answered, mapped onto the dashboard's result vocabulary. */
export function mapSshAnswer(result: SshRunResult): DeploymentAnalyticsResult {
  if (!result.ok) {
    // `command-failed` means SSH connected and authenticated and the remote
    // command — curl — exited non-zero. That is a failure of the request, not
    // of SSH, and curl's exit code says which (see CURL_EXIT).
    if (result.kind === "command-failed") {
      return {
        kind: "request-failed",
        exitCode: result.exitCode,
        stderr: result.stderr,
      };
    }
    return {
      kind: "ssh-failed",
      failure: result.kind,
      message: result.message,
      stderr: result.stderr,
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(result.stdout);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return {
      kind: "unreadable-answer",
      detail: `Not JSON (${err.message}): ${result.stdout.slice(0, ANSWER_HEAD_CHARS)}`,
    };
  }
  const parsed = AnalyticsQueryResultSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "unreadable-answer",
      detail: `Not an analytics result: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    };
  }
  return parsed.data;
}

/** Where a deployment is, and how to reach its box — as far as it resolved. */
export type DeploymentTarget =
  | { kind: "not-found" }
  | { kind: "no-ssh-key" }
  | { kind: "unverified" }
  | { kind: "ready"; target: SshTarget; loopbackPort: number };

/** The two effects the query needs, injected so the mapping is testable without a box. */
export interface QueryDeps {
  resolveDeployment: (deploymentId: string) => Promise<DeploymentTarget>;
  sshRun: (target: SshTarget, argv: string[]) => Promise<SshRunResult>;
}

export async function queryAnalyticsOverSsh(
  deps: QueryDeps,
  deploymentId: string,
  query: AnalyticsQuery,
): Promise<DeploymentAnalyticsResult | { kind: "not-found" }> {
  const resolved = await deps.resolveDeployment(deploymentId);
  if (resolved.kind !== "ready") return resolved;
  const answer = await deps.sshRun(
    resolved.target,
    analyticsCurlArgv(resolved.loopbackPort, query),
  );
  return mapSshAnswer(answer);
}
