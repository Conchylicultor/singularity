type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const ALLOWED_PATHS = [
  // Token definitions
  "plugins/ui/plugins/tokens/",
  "plugins/framework/plugins/web-core/web/theme/",
  // Gantt phase palettes (categorical: each step gets a distinct hue)
  "plugins/debug/plugins/profiling/plugins/build/web/components/build-section.tsx",
  "plugins/debug/plugins/profiling/plugins/boot/web/components/boot-section.tsx",
  "plugins/debug/plugins/profiling/plugins/stats/web/components/stats-section.tsx",
  "plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web/components/push-gantt.tsx",
  "plugins/build/plugins/build-profiling/web/components/build-profiling-section.tsx",
  // Other categorical palettes
  "plugins/conversations/plugins/summary/web/components/phase-styles.ts",
  "plugins/debug/plugins/claude-cli-calls/web/components/call-row.tsx",
  "plugins/plugin-meta/plugins/plugin-view/plugins/public-api/web/components/public-api-section.tsx",
  "plugins/apps/plugins/forge/plugins/catalog/web/components/categories/routes-table.tsx",
  // Files with remaining categorical colors after status-semantic migration
  "plugins/review/plugins/code-review/web/components/review-file-row.tsx",
  "plugins/review/plugins/plugin-changes/plugins/file-changes/web/components/file-changes-section.tsx",
  "plugins/build/plugins/build-info/web/components/build-info.tsx",
  // This check file itself
  "plugins/framework/plugins/tooling/plugins/checks/plugins/no-hardcoded-colors/check/index.ts",
  // --- Pre-existing violations (migrate to semantic tokens, then remove) ---
  "plugins/active-data/plugins/attempt/web/components/attempt-chip.tsx",
  "plugins/active-data/plugins/task-link/web/components/task-link-chip.tsx",
  "plugins/active-data/plugins/task/web/components/task-card.tsx",
  "plugins/agents/plugins/auto-launch/plugins/toggle/web/components/auto-launch-toggle.tsx",
  "plugins/apps/plugins/deploy/plugins/servers/web/components/server-detail.tsx",
  "plugins/apps/plugins/deploy/plugins/servers/web/components/server-status-badge.tsx",
  "plugins/apps/plugins/forge/plugins/publish/plugins/collapsed/web/components/collapsed-badge.tsx",
  "plugins/apps/plugins/forge/plugins/publish/plugins/load-bearing/web/components/load-bearing-badge.tsx",
  "plugins/auth/plugins/google/plugins/setup-wizard/web/components/google-setup-pane.tsx",
  "plugins/auth/web/components/accounts-pane.tsx",
  "plugins/auth/web/components/default-provider-row.tsx",
  "plugins/backup/web/components/backup-panel.tsx",
  "plugins/build/plugins/build-logs/web/components/build-log-section.tsx",
  "plugins/build/web/components/build-button.tsx",
  "plugins/build/web/components/build-popover-content.tsx",
  "plugins/code-explorer/web/components/file-tree.tsx",
  "plugins/config_v2/plugins/fields/plugins/secret/web/components/secret-renderer.tsx",
  "plugins/config_v2/plugins/settings/web/components/config-detail.tsx",
  "plugins/config_v2/plugins/settings/web/components/config-field-row.tsx",
  "plugins/config_v2/plugins/settings/web/components/config-nav-row.tsx",
  "plugins/config_v2/plugins/settings/web/components/config-sidebar-button.tsx",
  "plugins/conversations/plugins/conversation-category/web/internal/colors.ts",
  "plugins/conversations/plugins/conversation-ui/plugins/item/web/components/conversation-item.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/allow-monitor/web/components/allow-monitor-chip.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/code/plugins/docs-button/web/components/doc-row.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web/components/image-diff-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/commits-graph/web/components/commit-diff-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/commits-graph/web/components/commits-chip.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/commits-graph/web/components/commits-graph-body.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/web/components/drop-and-exit-button.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/plugins/deferred-tools-delta/web/components/deferred-tools-delta-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/plugins/task-reminder/web/components/task-reminder-attachment-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/task-notification/web/components/task-notification-row.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/add-task/web/components/add-task-tool-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/agent/web/components/agent-tool-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/ask-user-question/web/components/ask-user-question-tool-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/flag-raise/web/components/flag-raise-tool-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-progress-overlay.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-update-tool-view.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web/components/event-row.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web/components/jsonl-pane.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/launch-prompts/web/components/launch-prompts-button.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/markdown-extensions/web/internal/code-enhancer.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/notes/web/components/notes-area.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/status/web/components/status-badge.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/tasks-panel/web/components/tasks-button.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/turn-summary/web/components/turn-summary-card.tsx",
  "plugins/conversations/plugins/conversations-view/plugins/queue/web/components/queue-view.tsx",
  "plugins/conversations/plugins/summary/web/components/summary-pane.tsx",
  "plugins/debug/plugins/broadcasts/web/components/broadcasts-panel.tsx",
  "plugins/debug/plugins/memory/web/components/memory-panel.tsx",
  "plugins/debug/plugins/profiling/web/components/drag-selection.tsx",
  "plugins/debug/plugins/profiling/web/components/gantt-container.tsx",
  "plugins/health/web/components/health-dot.tsx",
  "plugins/notifications/web/components/bell-button.tsx",
  "plugins/plugin-meta/plugins/plugin-health/web/components/health-section.tsx",
  "plugins/plugin-meta/plugins/plugin-view/plugins/runtimes/web/components/runtimes-section.tsx",
  "plugins/plugin-meta/plugins/plugin-view/plugins/sub-plugins/web/components/sub-plugins-section.tsx",
  "plugins/plugin-meta/plugins/plugin-view/web/components/plugin-detail.tsx",
  "plugins/primitives/plugins/avatar/web/internal/colors.ts",
  "plugins/primitives/plugins/commit-list/web/internal/commit-row-item.tsx",
  "plugins/primitives/plugins/file-links/web/internal/file-link-text.tsx",
  "plugins/primitives/plugins/prompt-editor/plugins/voice-input/web/components/voice-input-button.tsx",
  "plugins/review/plugins/plugin-changes/plugins/api-changes/web/components/api-changes-summary.tsx",
  "plugins/review/plugins/plugin-changes/plugins/file-changes/web/components/file-changes-summary.tsx",
  "plugins/review/plugins/plugin-changes/web/components/plugin-change-card.tsx",
  "plugins/review/plugins/plugin-changes/web/components/plugin-changes-section.tsx",
  "plugins/review/plugins/plugin-changes/web/components/plugin-changes-summary.tsx",
  "plugins/tasks/plugins/auto-start/web/components/queued-chip-action.tsx",
  "plugins/tasks/plugins/task-draft-form/web/components/task-draft-form.tsx",
  "plugins/tasks/plugins/task-events/web/components/task-events.tsx",
  "plugins/tasks/plugins/task-graph/web/components/task-graph.tsx",
  "plugins/ui/plugins/segmented-progress-bar/plugins/dots/web/components/dots-renderer.tsx",
  "plugins/ui/plugins/segmented-progress-bar/plugins/segmented/web/components/segmented-renderer.tsx",
];

const COLOR_PATTERN =
  "(dark:)?(bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|caret|accent|divide|placeholder|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}";

const check: Check = {
  id: "no-hardcoded-colors",
  description:
    "Raw Tailwind color-scale classes must use semantic tokens (success/warning/info/destructive) instead",
  async run() {
    const root = await getRoot();
    const proc = Bun.spawn(
      [
        "git",
        "grep",
        "-E",
        "-n",
        "--",
        COLOR_PATTERN,
        ":(glob)plugins/**/*.ts",
        ":(glob)plugins/**/*.tsx",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    if (!out) return { ok: true };

    const offenders = out.split("\n").filter((line) => {
      const path = line.split(":", 1)[0]!;
      if (ALLOWED_PATHS.some((p) => path.startsWith(p))) return false;
      if (path.startsWith("research/")) return false;
      return true;
    });

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `raw Tailwind color-scale classes found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint: `Replace raw color classes (bg-emerald-600, text-amber-500, dark:bg-red-950) with semantic tokens:
  • Success / done / added / positive  → bg-success, text-success, bg-success/10
  • Warning / pending / held / caution → bg-warning, text-warning, bg-warning/10
  • Info / in-progress / running       → bg-info, text-info, bg-info/10
  • Error / failed / deleted           → bg-destructive, text-destructive
  • Neutral / muted                    → bg-muted, text-muted-foreground
If the color is categorical data-viz (Gantt phase, model tier, etc.), add the file to ALLOWED_PATHS in the no-hardcoded-colors check.`,
    };
  },
};

export default check;
