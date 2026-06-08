import noAdhocZindex from "./no-adhoc-zindex";

/**
 * Lint barrel for the `no-adhoc-zindex` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-zindex` repo-wide
 * as `error`.
 *
 * `ignores` is a TEMPORARY allowlist: the ~25 in-flow sticky-header / hover-chrome
 * / drag-handle sites and the base-ui portaled `web-core/.../ui/*` components still
 * carry raw z-index. A follow-up task migrates them to the semantic scale and
 * empties this list so the rule enforces with zero exemptions.
 */
export default {
  name: "z-layers",
  rules: {
    "no-adhoc-zindex": noAdhocZindex,
  },
  ignores: {
    "no-adhoc-zindex": [
      "plugins/conversations/plugins/conversation-view/plugins/commits-graph/web/components/commit-diff-view.tsx",
      "plugins/review/plugins/code-review/web/components/review-file-row.tsx",
      "plugins/review/plugins/code-review/web/components/code-review-section.tsx",
      "plugins/page/plugins/editor/web/components/block-editor.tsx",
      "plugins/page/plugins/editor/web/components/block-row.tsx",
      "plugins/page/plugins/code-block/web/components/code-block.tsx",
      "plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web/components/push-gantt.tsx",
      "plugins/code-explorer/web/components/file-tree.tsx",
      "plugins/reorder/web/internal/dnd-components.tsx",
      "plugins/primitives/plugins/data-table/web/internal/data-table.tsx",
      "plugins/primitives/plugins/tree/web/internal/tree-list.tsx",
      "plugins/primitives/plugins/tree/web/internal/row-chrome.tsx",
      "plugins/primitives/plugins/multi-select/web/internal/selection-bar.tsx",
      "plugins/apps/web/components/app-rail.tsx",
      "plugins/apps/plugins/sonata/plugins/piano-keyboard/web/components/piano-keyboard.tsx",
      "plugins/apps/plugins/sonata/plugins/piano-roll/web/components/piano-roll.tsx",
      "plugins/apps/plugins/sonata/plugins/rich/plugins/chord-overlay/web/components/chord-overlay.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/select.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/dropdown-menu.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/dialog.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/tooltip.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/sheet.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/popover.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/sidebar.tsx",
      "plugins/framework/plugins/web-core/web/components/ui/resizable.tsx",
      "plugins/layouts/plugins/miller/web/components/resize-handle.tsx",
      "plugins/layouts/plugins/miller/web/components/pane-overlay-host.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/queue/web/components/queue-view.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/group-gap-zone.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web/components/event-row.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web/components/jsonl-pane.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/task-tools/web/components/task-progress-overlay.tsx",
    ],
  },
};
