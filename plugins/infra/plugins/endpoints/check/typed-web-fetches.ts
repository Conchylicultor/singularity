type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Legacy raw fetch("/api/...") call sites. Each entry records the file path
// and the number of violations present when the allowlist was created.
// Migrating a call DECREASES the count (always passes); adding a new raw
// fetch INCREASES it past the limit (fails the check).
const ALLOWED = new Map<string, number>([
  ["plugins/active-data/plugins/plugin-link/web/components/plugin-link-chip.tsx", 1],
  ["plugins/active-data/plugins/plugin-link/web/panes.tsx", 1],
  ["plugins/active-data/plugins/task/web/components/task-card.tsx", 1],
  ["plugins/agents/plugins/auto-launch/plugins/toggle/web/components/auto-launch-toggle.tsx", 1],
  ["plugins/apps/plugins/deploy/plugins/servers/web/components/add-server-form.tsx", 1],
  ["plugins/apps/plugins/deploy/plugins/servers/web/components/server-detail.tsx", 1],
  ["plugins/apps/plugins/forge/plugins/catalog/web/components/catalog-view.tsx", 1],
  ["plugins/apps/plugins/forge/plugins/publish/web/components/publish-view.tsx", 1],
  ["plugins/backup/web/components/backup-panel.tsx", 2],
  ["plugins/build/plugins/build-profiling/web/components/build-profiling-section.tsx", 1],
  ["plugins/build/web/components/build-button.tsx", 1],
  ["plugins/build/web/components/build-popover-content.tsx", 1],
  ["plugins/code-explorer/web/components/file-tree-view.tsx", 1],
  ["plugins/config/web/internal/config-client.ts", 2],
  ["plugins/conversations-recover/web/components/recovery-view.tsx", 1],
  ["plugins/conversations/plugins/conversation-category/web/components/category-color-settings.tsx", 1],
  ["plugins/conversations/plugins/conversation-view/plugins/code/plugins/docs-button/web/use-pushed-doc-files.ts", 1],
  ["plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web/components/diff-view.tsx", 1],
  ["plugins/review/plugins/code-review/web/components/review-sections-settings.tsx", 3],
  ["plugins/review/plugins/code-review/web/use-push-files.ts", 1],
  ["plugins/conversations/plugins/conversation-view/plugins/launch-prompts/web/components/launch-prompts-button.tsx", 1],
  ["plugins/conversations/plugins/conversation-view/plugins/launch-prompts/web/components/launch-prompts-settings.tsx", 3],
  ["plugins/conversations/plugins/conversation-view/plugins/prompt-templates/web/components/prompt-template-chips.tsx", 1],
  ["plugins/conversations/plugins/conversation-view/plugins/prompt-templates/web/components/prompt-templates-settings.tsx", 3],
  ["plugins/conversations/plugins/conversation-view/plugins/quick-prompts/web/components/quick-prompts-settings.tsx", 3],
  ["plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/grouped-conversation-list.tsx", 12],
  ["plugins/conversations/plugins/conversations-view/plugins/queue/web/components/queue-view.tsx", 1],
  ["plugins/conversations/plugins/conversations-view/web/components/conversation-list.tsx", 1],
  ["plugins/conversations/plugins/conversations-view/web/internal/use-gone-conversations-pagination.ts", 1],
  ["plugins/conversations/web/use-conversations.ts", 1],
  ["plugins/crashes/web/report.ts", 1],
  ["plugins/debug/plugins/broadcasts/web/components/broadcasts-panel.tsx", 2],
  ["plugins/debug/plugins/memory/web/components/memory-panel.tsx", 2],
  ["plugins/debug/plugins/profiling/plugins/boot/web/components/boot-section.tsx", 1],
  ["plugins/debug/plugins/profiling/plugins/build/web/components/build-section.tsx", 1],
  ["plugins/debug/plugins/profiling/plugins/push/web/components/push-section.tsx", 1],
  ["plugins/debug/plugins/profiling/plugins/stats/web/components/stats-section.tsx", 1],
  ["plugins/debug/plugins/queue/web/components/queue-view.tsx", 4],
  ["plugins/debug/plugins/worktree-cleanup/web/components/worktree-cleanup-panel.tsx", 3],
  ["plugins/events-test/web/components/events-test-view.tsx", 6],
  ["plugins/health/web/internal/client.ts", 1],
  ["plugins/infra/plugins/attachments/web/internal/list.ts", 1],
  ["plugins/infra/plugins/attachments/web/internal/upload.ts", 1],
  ["plugins/notifications/web/components/bell-button.tsx", 3],
  ["plugins/plugin-meta/plugins/plugin-health/web/components/health-section.tsx", 1],
  ["plugins/plugin-meta/plugins/plugin-view/web/panes.tsx", 1],
  ["plugins/primitives/plugins/launch/web/components/launch-buttons.tsx", 1],
  ["plugins/reorder/web/internal/dnd-components.tsx", 3],
  ["plugins/reorder/web/internal/dnd-list-middleware.tsx", 6],
  ["plugins/reorder/web/internal/group-box.tsx", 3],
  ["plugins/screenshot/web/components/prompt-form.tsx", 1],
  ["plugins/screenshot/web/components/screenshot-button.tsx", 1],
  ["plugins/screenshot/web/components/screenshot-view.tsx", 1],
  ["plugins/stats/plugins/commits/web/components/excluded-path-toggles.tsx", 1],
  ["plugins/tasks/plugins/task-dependencies/web/components/task-dependencies.tsx", 2],
  ["plugins/tasks/plugins/task-dependencies/web/components/task-dependents.tsx", 1],
  ["plugins/tasks/plugins/task-draft-form/web/internal/submit.ts", 1],
  ["plugins/tasks/plugins/task-events/web/components/task-events.tsx", 1],
  ["plugins/tasks/plugins/task-graph/web/components/insertable-edge.tsx", 1],
  ["plugins/tasks/plugins/task-graph/web/components/task-graph.tsx", 2],
  ["plugins/tasks/plugins/task-header/web/components/task-header.tsx", 1],
  ["plugins/tasks/plugins/task-list/web/components/launch-agent-action.tsx", 1],
  ["plugins/tasks/plugins/task-list/plugins/tree/web/tasks-list.tsx", 1],
  ["plugins/tasks/web/client.ts", 4],
]);

const check: Check = {
  id: "endpoints:typed-web-fetches",
  description:
    'Web code must use fetchEndpoint/useEndpoint instead of raw fetch("/api/..."); legacy call sites are allowlisted with a per-file cap',
  async run() {
    const root = await getRoot();

    // Match direct fetch() calls and local wrappers (jsonFetch, postJson)
    // with a literal /api/ URL. The (<[^>]*>)? handles TS generic params
    // like jsonFetch<T>("/api/...").
    const proc = Bun.spawn(
      [
        "git",
        "grep",
        "-cE",
        '(fetch|jsonFetch|postJson)(<[^>]*>)?\\(["\'`]/api/',
        "--",
        "*.ts",
        "*.tsx",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders: string[] = [];

    for (const line of out.split("\n")) {
      const sep = line.lastIndexOf(":");
      if (sep === -1) continue;
      const path = line.slice(0, sep);
      const count = parseInt(line.slice(sep + 1), 10);

      if (!path.includes("/web/")) continue;

      const allowed = ALLOWED.get(path) ?? 0;
      if (count > allowed) {
        offenders.push(
          `${path}: ${count} raw fetch call(s) (allowed: ${allowed})`,
        );
      }
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} file(s) with raw fetch("/api/...") calls exceeding the allowlist:\n    ${offenders.join("\n    ")}`,
      hint: 'Use fetchEndpoint() / useEndpoint() / useEndpointMutation() from @plugins/infra/plugins/endpoints/web instead of raw fetch("/api/..."). See the endpoints plugin CLAUDE.md for the pattern.',
    };
  },
};

export default check;
