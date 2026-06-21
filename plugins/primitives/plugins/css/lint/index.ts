import noAdhocLayout from "./no-adhoc-layout";

/**
 * Lint barrel for the `no-adhoc-layout` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-layout` repo-wide
 * as `error`.
 *
 * Layout composition routes through the layout primitives —
 * `<Stack>`/`<Cluster>`/`<Row>` (rows), `<Grid>`/`<Center>`/`<Overlay>`
 * (@plugins/primitives/plugins/css/plugins/*), `<Stack>`/`<Inset>`
 * (@plugins/primitives/plugins/css/plugins/spacing/web), and `<Text>` inside a line
 * container (the only home for `min-w-0`) — never raw `flex`/`grid`/`items-*`/`absolute`/`overflow-*`.
 *
 * The `ignores` array below has two tiers:
 *
 *   1. PERMANENT — the layout primitives THEMSELVES. They own the raw mechanics
 *      the rule redirects to; they will never migrate (they ARE the
 *      implementation). These globs stay forever.
 *
 *   2. REVERTED — files restored to ad-hoc layout when the `<Frame>` named-slot
 *      row primitive was removed. They had been migrated onto `<Frame>` during the
 *      drain; reverting that migration re-introduces the raw flex/grid utilities,
 *      so they are re-allowlisted here. A genuinely-fixed one-off escapes per-site,
 *      travelling with the code:
 *
 *        // eslint-disable-next-line layout/no-adhoc-layout -- <reason>
 */
export default {
  name: "layout",
  rules: {
    "no-adhoc-layout": noAdhocLayout,
  },
  ignores: {
    "no-adhoc-layout": [
      // ── PERMANENT: the layout primitives themselves ──────────────────────
      "plugins/primitives/plugins/css/plugins/**/*.{ts,tsx}", // Grid/Cluster/Center/Overlay + presentational css/ sub-plugins (surface, card, text, spacing, badge, row, ...)
      "plugins/primitives/plugins/floating-action/web/internal/floating-action.tsx", // owns the morph/positioning mechanics (absolute panel, the rigid `trigger` collapsed-footprint wrapper) — a layout primitive, never drains
      // ── REVERTED: restored to ad-hoc layout when the <Frame> primitive was
      //    removed. These files were migrated onto <Frame> during the drain;
      //    reverting that migration to their original markup re-introduces the
      //    raw flex/grid utilities, re-allowlisted here. ──────────────────────
      "plugins/apps/plugins/agent-manager/plugins/shell/web/components/agent-manager-layout.tsx",
      "plugins/apps/plugins/agent-manager/plugins/welcome/web/components/welcome-view.tsx",
      "plugins/apps/plugins/agent-manager/plugins/worktree-switcher/web/components/worktree-dropdown.tsx",
      "plugins/apps/plugins/browser/plugins/omnibox/web/components/omnibox.tsx",
      "plugins/apps/plugins/browser/plugins/shell/web/components/browser-layout.tsx",
      "plugins/apps/plugins/deploy/plugins/servers/web/components/add-server-form.tsx",
      "plugins/apps/plugins/deploy/plugins/servers/web/components/server-detail.tsx",
      "plugins/apps/plugins/pages/plugins/history/web/components/page-version-preview.tsx",
      "plugins/apps/plugins/pages/plugins/welcome/plugins/recent-pages/web/components/recent-pages-section.tsx",
      "plugins/apps/plugins/sonata/plugins/library/web/components/song-card.tsx",
      "plugins/apps/plugins/sonata/plugins/piano-roll/web/components/fx-toggle.tsx",
      "plugins/apps/plugins/sonata/plugins/playback-history/web/components/play-stats.tsx",
      "plugins/apps/plugins/sonata/plugins/rich/plugins/chord-readout/web/components/chord-readout.tsx",
      "plugins/apps/plugins/sonata/plugins/rich/plugins/key-readout/web/components/key-readout.tsx",
      "plugins/apps/plugins/sonata/plugins/sources/plugins/midi/web/loader.tsx",
      "plugins/apps/plugins/sonata/plugins/track-mixer/web/components/track-mixer-panel.tsx",
      "plugins/apps/plugins/story/plugins/pages-integration/web/components/story-section.tsx",
      "plugins/apps/plugins/story/plugins/shell/web/components/story-header.tsx",
      "plugins/apps/plugins/studio/plugins/compositions/web/components/compositions-view.tsx",
      "plugins/apps/plugins/studio/plugins/compositions/web/components/contributor-editor.tsx",
      "plugins/apps/plugins/studio/plugins/compositions/web/components/diff-delta.tsx",
      "plugins/apps/plugins/studio/plugins/compositions/web/components/entry-editor.tsx",
      "plugins/apps/web/components/app-tab-bar.tsx",
      "plugins/auth/plugins/google/plugins/setup-wizard/web/components/google-setup-pane.tsx",
      "plugins/auth/web/components/default-provider-row.tsx",
      "plugins/auth/web/components/scope-grant-notice.tsx",
      "plugins/backup/web/components/backup-panel.tsx",
      "plugins/build/plugins/build-info/web/components/build-info.tsx",
      "plugins/build/plugins/build-logs/web/components/build-log-section.tsx",
      "plugins/build/web/components/build-button.tsx",
      "plugins/build/web/components/build-popover-content.tsx",
      "plugins/config_v2/plugins/config-link/web/components/config-menu-header.tsx",
      "plugins/config_v2/plugins/config-link/web/components/config-popover-header.tsx",
      "plugins/config_v2/plugins/settings/web/components/config-detail.tsx",
      "plugins/config_v2/plugins/settings/web/components/config-field-row.tsx",
      "plugins/conversations/plugins/agents/web/components/agent-detail.tsx",
      "plugins/conversations/plugins/conversation-ui/plugins/item/web/components/conversation-item.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/code/plugins/docs-button/web/components/doc-row.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web/components/file-pane.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web/file-peek-pane.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/commits-graph/web/components/commit-diff-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/commits-graph/web/components/commits-graph-body.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/dependencies/web/components/dep-popover-content.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/plugins/queued-command/web/components/structured-tag-card.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/plugins/task-reminder/web/components/task-reminder-attachment-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web/components/collapsible-card.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/message-toc/web/components/message-toc.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/task-notification/web/components/task-notification-row.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/add-task/web/components/add-task-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/agent/web/components/agent-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/ask-user-question/web/components/answer-form.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/ask-user-question/web/components/ask-user-question-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/bash/web/components/bash-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/edit/web/components/multi-edit-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/flag-raise/web/components/flag-raise-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/read/web/components/read-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-list-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-progress-overlay.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-update-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/workflow/web/components/workflow-graph.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/workflow/web/components/workflow-node-card.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/workflow/web/components/workflow-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web/components/tool-call-card.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web/components/event-line.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/launch-prompts/web/components/launch-prompts-button.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/op-status/web/components/op-status-banner.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/turn-summary/web/components/turn-summary-card.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/group-container.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/grouped-conversation-list.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/queue/web/components/queue-view.tsx",
      "plugins/conversations/plugins/recover/web/components/recovery-view.tsx",
      "plugins/conversations/plugins/summary/web/components/summary-pane.tsx",
      "plugins/debug/plugins/broadcasts/web/components/broadcasts-panel.tsx",
      "plugins/debug/plugins/claude-cli-calls/web/components/call-row.tsx",
      "plugins/debug/plugins/claude-cli-calls/web/components/calls-view.tsx",
      "plugins/debug/plugins/health-monitor/web/components/health-monitor-panel.tsx",
      "plugins/debug/plugins/live-state-health/web/components/server-resources-section.tsx",
      "plugins/debug/plugins/logs/web/components/log-viewer.tsx",
      "plugins/debug/plugins/memory/web/components/memory-panel.tsx",
      "plugins/debug/plugins/profiling/web/components/gantt-view.tsx",
      "plugins/debug/plugins/queue/web/components/queue-view.tsx",
      "plugins/debug/plugins/slow-ops/plugins/cluster/web/components/cluster-view.tsx",
      "plugins/debug/plugins/worktree-cleanup/web/components/worktree-cleanup-panel.tsx",
      "plugins/fields/plugins/avatar/plugins/config/web/components/avatar-renderer.tsx",
      "plugins/fields/plugins/bool/plugins/config/web/components/bool-renderer.tsx",
      "plugins/fields/plugins/color/plugins/config/web/components/color-renderer.tsx",
      "plugins/fields/plugins/list/plugins/config/web/components/list-item-row.tsx",
      "plugins/fields/plugins/string-list/plugins/config/web/components/string-list-renderer.tsx",
      "plugins/improve/plugins/element-picker/web/components/ui-context-chip.tsx",
      "plugins/infra/plugins/events-test/web/components/events-test-view.tsx",
      "plugins/page/plugins/bookmark/web/components/bookmark-block.tsx",
      "plugins/page/plugins/code-block/web/components/code-block.tsx",
      "plugins/page/plugins/editor/web/components/block-text-editor.tsx",
      "plugins/page/plugins/file/web/components/file-block.tsx",
      "plugins/page/plugins/read-only-view/web/components/read-only-blocks.tsx",
      "plugins/plugin-meta/plugins/facets/plugins/commands/plugins/render-detail/web/components/commands-detail-section.tsx",
      "plugins/plugin-meta/plugins/facets/plugins/contributions/plugins/render-detail/web/components/contributions-detail-section.tsx",
      "plugins/plugin-meta/plugins/facets/plugins/db-schema/plugins/render-detail/web/components/db-schema-detail-section.tsx",
      "plugins/plugin-meta/plugins/facets/plugins/registrations/plugins/render-detail/web/components/registrations-detail-section.tsx",
      "plugins/plugin-meta/plugins/facets/plugins/resources/plugins/render-detail/web/components/resources-detail-section.tsx",
      "plugins/plugin-meta/plugins/facets/plugins/routes/plugins/render-detail/web/components/routes-detail-section.tsx",
      "plugins/plugin-meta/plugins/facets/plugins/slots/plugins/render-detail/web/components/slots-detail-section.tsx",
      "plugins/plugin-meta/plugins/plugin-view/web/components/section.tsx",
      "plugins/primitives/plugins/breadcrumb/web/internal/breadcrumb.tsx",
      "plugins/primitives/plugins/command-palette/web/internal/command-palette-dialog.tsx",
      "plugins/primitives/plugins/commit-list/web/internal/commit-row-item.tsx",
      "plugins/primitives/plugins/data-view/plugins/list/web/components/list-view.tsx",
      "plugins/primitives/plugins/data-view/web/components/filter/conjunction-cell.tsx",
      "plugins/primitives/plugins/data-view/web/components/filter/filter-rule-row.tsx",
      "plugins/primitives/plugins/data-view/web/components/sort/add-sort-affordance.tsx",
      "plugins/primitives/plugins/data-view/web/components/sort/presets/save-preset-affordance.tsx",
      "plugins/primitives/plugins/data-view/web/components/sort/sort-builder-popover.tsx",
      "plugins/primitives/plugins/data-view/web/components/sort/sort-rule-row.tsx",
      "plugins/primitives/plugins/error-boundary/web/components/plugin-error-boundary.tsx",
      "plugins/primitives/plugins/folder-picker/web/internal/folder-picker-popover.tsx",
      "plugins/primitives/plugins/graph-canvas/web/components/canvas-node.tsx",
      "plugins/primitives/plugins/launch/web/components/launch-control.tsx",
      "plugins/primitives/plugins/loading/web/internal/loading.tsx",
      "plugins/primitives/plugins/slot-render/web/internal/render-slot.tsx",
      "plugins/reorder/plugins/node-types/plugins/header/web/components/header-box.tsx",
      "plugins/reorder/web/components/reorder-diff-renderer.tsx",
      "plugins/review/plugins/code-review/web/components/code-review-section.tsx",
      "plugins/review/plugins/code-review/web/components/review-file-row.tsx",
      "plugins/review/plugins/config-defaults/web/components/config-defaults-section.tsx",
      "plugins/review/plugins/plugin-changes/plugins/api-changes/web/components/api-changes-section.tsx",
      "plugins/review/plugins/plugin-changes/plugins/file-changes/web/components/file-changes-section.tsx",
      "plugins/review/plugins/plugin-changes/web/components/plugin-change-card.tsx",
      "plugins/screenshot/web/components/tools-pane.tsx",
      "plugins/shell/plugins/notifications/web/components/bell-button.tsx",
      "plugins/stats/plugins/commits/web/components/lines-charts.tsx",
      "plugins/stats/plugins/cost/web/components/cost-kpis.tsx",
      "plugins/stats/plugins/cost/web/components/top-conversations-table.tsx",
      "plugins/tasks/plugins/attempt-view/web/components/attempt-pane.tsx",
      "plugins/tasks/plugins/task-draft-form/web/components/task-draft-form.tsx",
      "plugins/tasks/plugins/task-events/web/components/task-events.tsx",
      "plugins/tasks/plugins/task-header/web/components/task-header.tsx",
      "plugins/ui/plugins/theme-engine/plugins/theme-customizer/web/components/theme-customizer.tsx",
      "plugins/ui/plugins/tokens/plugins/color-adjust/web/components/color-adjust-picker.tsx",
      "plugins/ui/plugins/tokens/plugins/shadow/web/components/shadow-section.tsx",
      "plugins/ui/plugins/tweakcn/plugins/community-browser/web/components/community-theme-card.tsx",
      "plugins/ui/plugins/tweakcn/plugins/community-browser/web/components/import-by-url.tsx",
    ],
  },
};
