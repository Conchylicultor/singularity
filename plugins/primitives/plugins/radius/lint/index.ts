import noAdhocRadius from "./no-adhoc-radius";

/**
 * Lint barrel for the `no-adhoc-radius` rule (Phase 7 of the chrome-craft
 * overhaul). The root `eslint.config.ts` auto-discovers this default export,
 * registers `no-adhoc-radius` repo-wide as `error`, and flips it off for the
 * files listed under `ignores`.
 *
 * `ignores` is a TEMPORARY allowlist of current offenders — every file that
 * still hand-writes a bare `rounded` (static 0.25rem) or an arbitrary
 * `rounded-[…]` is exempted so the rule can land as `error` without a blocking
 * sweep. New code is blocked immediately; legacy burns down one allowlist entry
 * at a time as files migrate to the token-driven `rounded-{sm,md,lg,…}` scale
 * (or an intentional `rounded-full`/`rounded-none`). Regenerate with:
 *
 *   rg -l -e '[`"'"'"' ]rounded[`"'"'"' ]' -e 'rounded-\[' plugins \
 *     -g '*.ts' -g '*.tsx' | sort
 *
 * then prune files where `rounded` lives only in a comment / description /
 * regex (the rule scans className/cn-clsx contexts only, so those never fire)
 * and the already-migrated chrome (row.tsx, resize-handle.tsx — now ENFORCED).
 */
export default {
  name: "radius",
  rules: {
    "no-adhoc-radius": noAdhocRadius,
  },
  ignores: {
    "no-adhoc-radius": [
      "plugins/active-data/plugins/plugin-link/web/components/plugin-link-chip.tsx",
      "plugins/agents/web/components/agent-detail.tsx",
      "plugins/agents/web/components/delete-agent-action.tsx",
      "plugins/agents/web/components/system-folder.tsx",
      "plugins/apps/plugins/deploy/plugins/servers/web/components/add-server-form.tsx",
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/delete-page-action.tsx",
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/page-icon-button.tsx",
      "plugins/apps/plugins/sonata/plugins/sources/plugins/chord-grid/web/loader.tsx",
      "plugins/apps/plugins/sonata/plugins/track-mixer/web/components/track-mixer-panel.tsx",
      "plugins/apps/plugins/studio/plugins/explorer/plugins/expand-collapse/web/components/expand-collapse-button.tsx",
      "plugins/apps/plugins/studio/plugins/explorer/web/components/plugin-tree.tsx",
      "plugins/attempt-view/web/components/attempt-pane.tsx",
      "plugins/auth/plugins/google/plugins/setup-wizard/web/components/google-setup-pane.tsx",
      "plugins/auth/web/components/accounts-pane.tsx",
      "plugins/build/plugins/build-logs/web/components/build-log-section.tsx",
      "plugins/build/plugins/build-profiling/web/components/build-profiling-section.tsx",
      "plugins/build/web/components/build-button.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web/components/image-diff-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/dependencies/web/components/dep-popover-content.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/code-listing/web/components/code-with-line-numbers.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/investigate-event/web/components/investigate-event-button.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/agent/web/components/agent-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/ask-user-question/web/components/answer-form.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/ask-user-question/web/components/ask-user-question-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/edit/web/components/edit-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/edit/web/components/multi-edit-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/flag-raise/web/components/flag-raise-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/read/web/components/read-image-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/skill/web/components/skill-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-get-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-output-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-progress-overlay.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/workflow/web/components/workflow-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web/components/generic-tool-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/user-image/web/components/user-image-row.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/user-text/web/components/user-text-row.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/markdown-extensions/web/internal/code-enhancer.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/markdown-extensions/web/internal/img-enhancer.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/group-box.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/group-container.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/group-gap-zone.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/group-rename.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/grouped-conversation-list.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/queue/web/components/queue-view.tsx",
      "plugins/crashes/plugins/launch-fix/web/components/launch-fix-button.tsx",
      "plugins/debug/plugins/broadcasts/web/components/broadcasts-panel.tsx",
      "plugins/debug/plugins/claude-cli-calls/web/components/call-row.tsx",
      "plugins/debug/plugins/profiling/plugins/build/web/components/build-detail.tsx",
      "plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web/components/push-gantt.tsx",
      "plugins/debug/plugins/profiling/plugins/push/web/components/push-detail.tsx",
      "plugins/debug/plugins/profiling/web/components/shared.tsx",
      "plugins/debug/plugins/queue/web/components/queue-view.tsx",
      "plugins/events-test/web/components/events-test-view.tsx",
      "plugins/fields/plugins/color/plugins/table/web/components/color-cell.tsx",
      "plugins/fields/plugins/date/plugins/filter/web/components/date-filter.tsx",
      "plugins/fields/plugins/image/plugins/table/web/components/image-cell.tsx",
      "plugins/fields/plugins/number/plugins/filter/web/components/number-filter.tsx",
      "plugins/fields/plugins/text/plugins/filter/web/components/text-filter.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/button.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/scroll-area.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/select.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/tooltip.tsx",
      "plugins/page/plugins/code-block/web/components/code-block.tsx",
      "plugins/page/plugins/divider/web/components/divider-block.tsx",
      "plugins/page/plugins/editor/web/components/block-editor.tsx",
      "plugins/page/plugins/editor/web/components/block-row.tsx",
      "plugins/page/plugins/image/web/components/image-block.tsx",
      "plugins/primitives/plugins/collapsible/web/internal/expand-all-button.tsx",
      "plugins/primitives/plugins/color-picker/web/internal/color-input.tsx",
      "plugins/primitives/plugins/color-picker/web/internal/color-picker-popover.tsx",
      "plugins/primitives/plugins/launch/web/components/launch-control.tsx",
      "plugins/primitives/plugins/markdown/web/internal/base-components.tsx",
      "plugins/primitives/plugins/syntax-highlight/web/internal/highlighted-code.tsx",
      "plugins/primitives/plugins/text-editor/plugins/paste-images/web/components/attachment-thumbnail.tsx",
      "plugins/primitives/plugins/text-editor/plugins/paste-images/web/components/lightbox.tsx",
      "plugins/primitives/plugins/tooltip/web/components/kbd.tsx",
      "plugins/primitives/plugins/tree/web/internal/row-chrome.tsx",
      "plugins/primitives/plugins/tree/web/internal/tree-list.tsx",
      "plugins/primitives/plugins/tree/web/internal/tree-row-chrome.tsx",
      "plugins/reorder/web/internal/dnd-components.tsx",
      "plugins/reorder/web/internal/group-box.tsx",
      "plugins/reorder/web/internal/group-rename.tsx",
      "plugins/review/plugins/plugin-changes/plugins/file-changes/web/components/file-changes-section.tsx",
      "plugins/stats/plugins/cost/web/components/cost-kpis.tsx",
      "plugins/tasks/plugins/task-attachments/web/components/task-attachments.tsx",
      "plugins/tasks/plugins/task-dependencies/web/components/task-dependencies.tsx",
      "plugins/tasks/plugins/task-dependencies/web/components/task-dependents.tsx",
      "plugins/tasks/plugins/task-description/web/components/description-view.tsx",
      "plugins/tasks/plugins/task-draft-form/web/components/task-draft-card.tsx",
      "plugins/tasks/plugins/task-events/web/components/task-events.tsx",
      "plugins/tasks/plugins/task-list/web/components/delete-task-action.tsx",
      "plugins/ui/plugins/theme-engine/plugins/theme-customizer/web/components/token-row.tsx",
      "plugins/ui/plugins/tokens/plugins/shadow/web/components/shadow-section.tsx",
    ],
  },
};
