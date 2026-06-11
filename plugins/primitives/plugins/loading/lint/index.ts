import noAdhocLoadingText from "./no-adhoc-loading-text";
import noShadcnSkeleton from "./no-shadcn-skeleton";

export default {
  name: "loading",
  rules: {
    "no-adhoc-loading-text": noAdhocLoadingText,
    "no-shadcn-skeleton": noShadcnSkeleton,
  },
  ignores: {
    "no-adhoc-loading-text": [
      // BURNDOWN — pre-existing hand-rolled loading texts grandfathered when
      // the rule landed (2026-06-11). Migrate to <Loading> (or <Placeholder>)
      // and REMOVE the entry. Do NOT add new entries.
      "plugins/active-data/plugins/plugin-link/web/panes.tsx",
      "plugins/apps/plugins/deploy/plugins/servers/web/panes.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/columns/web/components/columns-section.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/foreign-keys/web/components/foreign-keys-section.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/indexes/web/components/indexes-section.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/row-count/web/components/row-count-section.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/sample-rows/web/components/sample-rows-section.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/web/components/contributions-view.tsx",
      "plugins/apps/plugins/studio/plugins/explorer/web/components/explorer-view.tsx",
      "plugins/backup/web/components/backup-panel.tsx",
      "plugins/code-explorer/web/components/file-tree-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web/components/image-diff-view.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web/components/jsonl-pane.tsx",
      "plugins/conversations/plugins/conversation-view/web/components/conversation-view.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/grouped/web/components/grouped-view.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/history/web/components/history-view.tsx",
      "plugins/debug/plugins/broadcasts/web/components/broadcasts-panel.tsx",
      "plugins/debug/plugins/memory/web/components/memory-panel.tsx",
      "plugins/page/plugins/editor/web/components/block-editor.tsx",
      "plugins/plugin-meta/plugins/plugin-view/web/panes.tsx",
      "plugins/primitives/plugins/icon-picker/web/components/icon-picker.tsx",
      "plugins/review/plugins/plugin-changes/plugins/file-changes/web/components/file-changes-section.tsx",
      "plugins/review/plugins/plugin-changes/web/components/plugin-changes-section.tsx",
      "plugins/screenshot/web/components/screenshot-view.tsx",
      "plugins/stats/plugins/commits/web/components/chart-primitives.tsx",
      "plugins/ui/plugins/tweakcn/plugins/community-browser/web/components/community-browser-section.tsx",
    ],
  },
};
