import type { ReactNode } from "react";
import type { AnalyticsFilter } from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { CURL_EXIT, type DeploymentAnalyticsResult } from "../../core";
import { DIMENSION_LABEL } from "../internal/format";

/** Every answer that is not a report. */
export type NonReport = Exclude<DeploymentAnalyticsResult, { kind: "report" }>;

const SSH_FAILURE_TEXT: Record<
  Extract<NonReport, { kind: "ssh-failed" }>["failure"],
  string
> = {
  dns: "The server's hostname does not resolve.",
  unreachable: "The server refused the connection or cannot be reached.",
  timeout: "The SSH connection timed out.",
  auth: "The server rejected this app's SSH key.",
  "host-key-mismatch":
    "The server presented a different host key than the one pinned — it was reinstalled, or something is intercepting the connection. Check the server's page.",
  "command-failed": "The command on the server failed.",
  unknown: "SSH failed for a reason it did not classify.",
};

function curlExplanation(exitCode: number | null): string {
  switch (exitCode) {
    case CURL_EXIT.couldNotConnect:
      return "Nothing answered on the install's loopback port — the site is not running.";
    case CURL_EXIT.httpError:
      return "The site answered with an error. If it was deployed before analytics was added to its composition, deploy it again.";
    case CURL_EXIT.timedOut:
      return "The site took too long to compute the report.";
    case null:
      return "The request on the server was killed before it finished.";
    default:
      return `The request on the server failed (curl exit ${exitCode}).`;
  }
}

function ErrorState({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <Stack gap="xs" align="start" role="alert">
      <Text as="p" variant="body" tone="destructive">
        {title}
      </Text>
      {detail && (
        <Text
          as="pre"
          variant="code"
          tone="muted"
          className="whitespace-pre-wrap break-all"
        >
          {detail}
        </Text>
      )}
      {children}
    </Stack>
  );
}

/**
 * The dashboard's body for every answer that is not a report. Each is named
 * for what failed and what to do — none of them renders as an empty dashboard.
 */
export function ResultState({
  result,
  filters,
  onKeepFirstFilter,
}: {
  result: NonReport;
  filters: readonly AnalyticsFilter[];
  onKeepFirstFilter: () => void;
}): ReactNode {
  switch (result.kind) {
    case "refused": {
      const first = filters[0];
      return (
        <ErrorState
          title={`This range reaches past the last ${result.rawWindowDays} days, where only single filters are kept — at most ${result.maxFilters} filter applies.`}
        >
          {first && (
            <Button variant="outline" onClick={onKeepFirstFilter}>
              Keep only “{DIMENSION_LABEL[first.dimension]} is {first.value}”
            </Button>
          )}
        </ErrorState>
      );
    }
    case "no-ssh-key":
      return (
        <ErrorState title="This deployment's server has no SSH key yet, so its analytics cannot be read. Set one up on the server's page." />
      );
    case "unverified":
      return (
        <ErrorState title="This deployment's server connection was never verified, so its identity is unknown. Verify the connection on the server's page first." />
      );
    case "ssh-failed":
      return (
        <ErrorState
          title={SSH_FAILURE_TEXT[result.failure]}
          detail={result.stderr || result.message}
        />
      );
    case "request-failed":
      return (
        <ErrorState
          title={curlExplanation(result.exitCode)}
          detail={result.stderr || undefined}
        />
      );
    case "unreadable-answer":
      return (
        <ErrorState
          title="The site answered, but not with an analytics report."
          detail={result.detail}
        />
      );
  }
}
