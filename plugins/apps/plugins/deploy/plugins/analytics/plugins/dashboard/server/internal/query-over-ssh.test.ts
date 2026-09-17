import { describe, expect, it } from "bun:test";
import type {
  SshRunResult,
  SshTarget,
} from "@plugins/infra/plugins/ssh/server";
import {
  DIMENSIONS,
  ZERO_METRICS,
  decodeAnalyticsQueryJson,
  type AnalyticsQuery,
  type AnalyticsQueryResult,
  type AnalyticsReport,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import {
  analyticsCurlArgv,
  mapSshAnswer,
  queryAnalyticsOverSsh,
  type DeploymentTarget,
} from "./query-over-ssh";

const QUERY: AnalyticsQuery = {
  range: "7d",
  compare: true,
  filters: [{ dimension: "channel", value: "Search" }],
};

const TARGET: SshTarget = {
  host: "box.example",
  port: 22,
  user: "root",
  privateKey: "KEY",
  hostKey: { mode: "pinned", knownHostsLine: "box ssh-ed25519 AAAA" },
};

const REPORT: AnalyticsReport = {
  source: "raw",
  range: "7d",
  granularity: "day",
  filters: QUERY.filters,
  generatedAt: "2026-09-17T10:00:00.000Z",
  current: {
    from: "2026-09-11",
    to: "2026-09-17",
    summary: ZERO_METRICS,
    series: [],
  },
  previous: null,
  rows: Object.fromEntries(
    DIMENSIONS.map((d) => [d, []]),
  ) as unknown as AnalyticsReport["rows"],
};

type SshFailureResult = Extract<SshRunResult, { ok: false }>;

function ok(stdout: string): SshRunResult {
  return { ok: true, stdout, stderr: "", learnedHostKey: null };
}

function fail(
  kind: SshFailureResult["kind"],
  exitCode: number | null,
): SshRunResult {
  return {
    ok: false,
    kind,
    message: `${kind} happened`,
    stderr: "raw stderr",
    exitCode,
  };
}

describe("analyticsCurlArgv", () => {
  it("curls the install's gateway on loopback, with the query base64url-encoded", () => {
    const argv = analyticsCurlArgv(9100, QUERY);
    expect(argv.slice(0, 4)).toEqual(["curl", "-fsS", "-m", "10"]);
    const url = new URL(argv[4]!);
    expect(url.origin).toBe("http://127.0.0.1:9100");
    expect(url.pathname).toBe("/api/host-only/analytics/query");
    const q = url.searchParams.get("q")!;
    // Nothing the remote shell would need quoted.
    expect(q).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(decodeAnalyticsQueryJson(q))).toEqual(QUERY);
  });
});

describe("mapSshAnswer", () => {
  it("passes a report through verbatim", () => {
    const answer: AnalyticsQueryResult = { kind: "report", report: REPORT };
    expect(mapSshAnswer(ok(JSON.stringify(answer)))).toEqual(answer);
  });

  it("passes a refusal through verbatim", () => {
    const answer: AnalyticsQueryResult = {
      kind: "refused",
      reason: "stacked-filters-beyond-raw-window",
      maxFilters: 1,
      rawWindowDays: 90,
    };
    expect(mapSshAnswer(ok(JSON.stringify(answer)))).toEqual(answer);
  });

  it("names non-JSON stdout as unreadable, never as an empty report", () => {
    const mapped = mapSshAnswer(ok("<html>502 Bad Gateway</html>"));
    expect(mapped.kind).toBe("unreadable-answer");
    if (mapped.kind === "unreadable-answer") {
      expect(mapped.detail).toContain("502 Bad Gateway");
    }
  });

  it("names JSON that is not a result as unreadable", () => {
    expect(mapSshAnswer(ok(JSON.stringify({ kind: "report" }))).kind).toBe(
      "unreadable-answer",
    );
  });

  it("maps a failed remote command to request-failed with curl's exit code", () => {
    expect(mapSshAnswer(fail("command-failed", 22))).toEqual({
      kind: "request-failed",
      exitCode: 22,
      stderr: "raw stderr",
    });
  });

  it("maps every SSH-layer failure to ssh-failed with its kind", () => {
    for (const kind of [
      "dns",
      "unreachable",
      "timeout",
      "auth",
      "host-key-mismatch",
      "unknown",
    ] as const) {
      expect(mapSshAnswer(fail(kind, 255))).toEqual({
        kind: "ssh-failed",
        failure: kind,
        message: `${kind} happened`,
        stderr: "raw stderr",
      });
    }
  });
});

describe("queryAnalyticsOverSsh", () => {
  it("runs the curl against the resolved target and port", async () => {
    const calls: { target: SshTarget; argv: string[] }[] = [];
    const result = await queryAnalyticsOverSsh(
      {
        resolveDeployment: async () => ({
          kind: "ready",
          target: TARGET,
          loopbackPort: 9123,
        }),
        sshRun: async (target, argv) => {
          calls.push({ target, argv });
          return ok(JSON.stringify({ kind: "report", report: REPORT }));
        },
      },
      "dep-1",
      QUERY,
    );
    expect(result.kind).toBe("report");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.target).toBe(TARGET);
    expect(calls[0]!.argv[4]!.startsWith("http://127.0.0.1:9123/")).toBe(true);
  });

  it("never opens a session when the deployment does not resolve", async () => {
    const unresolved: DeploymentTarget[] = [
      { kind: "not-found" },
      { kind: "no-ssh-key" },
      { kind: "unverified" },
    ];
    for (const resolved of unresolved) {
      let ran = false;
      const result = await queryAnalyticsOverSsh(
        {
          resolveDeployment: async () => resolved,
          sshRun: async () => {
            ran = true;
            return ok("");
          },
        },
        "dep-1",
        QUERY,
      );
      expect(result).toEqual(resolved as typeof result);
      expect(ran).toBe(false);
    }
  });
});
