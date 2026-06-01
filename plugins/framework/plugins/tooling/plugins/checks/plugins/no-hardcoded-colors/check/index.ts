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
  "plugins/active-data/plugins/attempt/web/components/attempt-chip.tsx",
  "plugins/build/web/components/build-popover-content.tsx",
  "plugins/debug/plugins/memory/web/components/memory-panel.tsx",
  "plugins/code-explorer/web/components/file-tree.tsx",
  "plugins/conversations/plugins/conversation-category/web/internal/colors.ts",
  "plugins/conversations/plugins/conversation-view/plugins/code/plugins/docs-button/web/components/doc-row.tsx",
  "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/agent/web/components/agent-tool-view.tsx",
  "plugins/conversations/plugins/model-provider/web/internal/family-class.ts",
  "plugins/plugin-meta/plugins/plugin-view/plugins/runtimes/web/components/runtimes-section.tsx",
  "plugins/plugin-meta/plugins/plugin-view/plugins/sub-plugins/web/components/sub-plugins-section.tsx",
  "plugins/plugin-meta/plugins/plugin-view/web/components/plugin-detail.tsx",
  "plugins/primitives/plugins/avatar/web/internal/colors.ts",
  "plugins/tasks/plugins/task-graph/web/components/task-graph.tsx",
  "plugins/review/plugins/plugin-changes/plugins/api-changes/web/components/api-changes-summary.tsx",
  // Files with remaining categorical colors after status-semantic migration
  "plugins/review/plugins/code-review/web/components/review-file-row.tsx",
  "plugins/review/plugins/plugin-changes/plugins/file-changes/web/components/file-changes-section.tsx",
  "plugins/build/plugins/build-info/web/components/build-info.tsx",
  // This check file itself
  "plugins/framework/plugins/tooling/plugins/checks/plugins/no-hardcoded-colors/check/index.ts",
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
