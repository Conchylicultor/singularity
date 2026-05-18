type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Files that predate the defineEndpoint migration. New handlers must not be
// added here — use defineEndpoint + implement() instead.
const ALLOWED = new Set([
  "plugins/active-data/server/index.ts",
  "plugins/agents/plugins/auto-launch/plugins/toggle/server/index.ts",
  "plugins/apps/plugins/deploy/plugins/servers/server/index.ts",
  "plugins/apps/plugins/forge/plugins/catalog/plugins/tables/plugins/columns/server/index.ts",
  "plugins/apps/plugins/forge/plugins/catalog/plugins/tables/plugins/foreign-keys/server/index.ts",
  "plugins/apps/plugins/forge/plugins/catalog/plugins/tables/plugins/indexes/server/index.ts",
  "plugins/apps/plugins/forge/plugins/catalog/plugins/tables/plugins/row-count/server/index.ts",
  "plugins/apps/plugins/forge/plugins/catalog/plugins/tables/plugins/sample-rows/server/index.ts",
  "plugins/apps/plugins/workflows/plugins/engine/server/index.ts",
  "plugins/auth/central/index.ts",
  "plugins/backup/server/index.ts",
  "plugins/build/plugins/build-profiling/server/index.ts",
  "plugins/build/server/index.ts",
  "plugins/code-explorer/plugins/file-resolve/server/index.ts",
  "plugins/code-explorer/server/index.ts",
  "plugins/config/server/index.ts",
  "plugins/conversations-recover/server/index.ts",
  "plugins/conversations/plugins/conversation-category/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/allow-monitor/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/code/plugins/review/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/exit/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/hold-and-exit/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/launch-prompts/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/notes/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/prompt-templates/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/push-and-exit/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/quick-prompts/server/index.ts",
  "plugins/conversations/plugins/conversation-view/plugins/resume/server/index.ts",
  "plugins/conversations/plugins/conversations-view/plugins/grouped/server/index.ts",
  "plugins/conversations/plugins/conversations-view/plugins/queue/server/index.ts",
  "plugins/conversations/plugins/summary/server/index.ts",
  "plugins/conversations/plugins/transcript-api/server/index.ts",
  "plugins/conversations/server/index.ts",
  "plugins/crashes/server/index.ts",
  "plugins/debug/plugins/broadcasts/server/index.ts",
  "plugins/debug/plugins/logs/server/index.ts",
  "plugins/debug/plugins/memory/server/index.ts",
  "plugins/debug/plugins/profiling/plugins/boot/server/index.ts",
  "plugins/debug/plugins/profiling/plugins/build/server/index.ts",
  "plugins/debug/plugins/profiling/plugins/stats/server/index.ts",
  "plugins/debug/plugins/worktree-cleanup/server/index.ts",
  "plugins/events-test/server/index.ts",
  "plugins/health/server/index.ts",
  "plugins/infra/plugins/attachments/server/index.ts",
  "plugins/infra/plugins/events/server/index.ts",
  "plugins/infra/plugins/jobs/server/index.ts",
  "plugins/infra/plugins/mcp/server/index.ts",
  "plugins/infra/plugins/secrets/central/index.ts",
  "plugins/notifications/server/index.ts",
  "plugins/plugin-meta/plugins/plugin-health/server/index.ts",
  "plugins/plugin-meta/plugins/plugin-view/server/index.ts",
  "plugins/reorder/plugins/groups/server/index.ts",
  "plugins/reorder/server/index.ts",
  "plugins/review/plugins/plugin-changes/server/index.ts",
  "plugins/screenshot/server/index.ts",
  "plugins/stats/plugins/commits/server/index.ts",
  "plugins/stats/plugins/cost/server/index.ts",
  "plugins/stats/plugins/tasks/server/index.ts",
  "plugins/tasks/server/index.ts",
]);

const check: Check = {
  id: "endpoints:typed-handlers",
  description:
    "HTTP route handlers must use defineEndpoint + implement(); literal route strings in httpRoutes are forbidden for new plugins",
  async run() {
    const root = await getRoot();

    const proc = Bun.spawn(
      [
        "git",
        "grep",
        "-nE",
        '"(GET|POST|PUT|PATCH|DELETE) /[^"]*"[ ]*:',
        "--",
        "*.ts",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders: string[] = [];
    for (const line of out.split("\n")) {
      const path = line.split(":", 1)[0];

      if (
        !path.startsWith("plugins/") ||
        (!path.includes("/server/index.ts") &&
          !path.includes("/central/index.ts"))
      )
        continue;

      const content = line.split(":").slice(2).join(":").trimStart();
      if (content.startsWith("//") || content.startsWith("*")) continue;

      if (ALLOWED.has(path)) continue;

      offenders.push(line);
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} literal route key(s) not using defineEndpoint:\n    ${offenders.join("\n    ")}`,
      hint: "Define endpoints with defineEndpoint() in core/endpoints.ts and use implement() in server handlers. See @plugins/agents for the canonical example.",
    };
  },
};

export default check;
