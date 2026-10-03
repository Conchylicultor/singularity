import noLegacyResourceSpelling from "./no-legacy-resource-spelling";
import noSentinelParam from "./no-sentinel-param";

export default {
  name: "live",
  rules: {
    "no-legacy-resource-spelling": noLegacyResourceSpelling,
    "no-sentinel-param": noSentinelParam,
  },
  ignores: {
    // Two kinds of entry. `index.test.ts` holds both to the disk: a glob's
    // plugin must exist, and a listed file must exist AND still import an old
    // spelling — so a file a wave migrated fails the suite until it leaves.
    "no-legacy-resource-spelling": [
      // (a) PERMANENT — the substrate: the plugins that define the old
      // spellings, and the ones compiled onto them (this API, the optimistic
      // overlay, the runtime and its server / central facades).
      "plugins/network/plugins/live/**",
      "plugins/infra/plugins/query-resource/**",
      "plugins/primitives/plugins/live-state/**",
      "plugins/primitives/plugins/optimistic-mutation/**",
      "plugins/framework/plugins/resource-runtime/**",
      "plugins/framework/plugins/server-core/**",
      "plugins/framework/plugins/central-core/**",

      // (b) BURNDOWN — every other file that imported an old spelling when
      // phase 3 started (research/2026-09-27-global-live-resources-phase3-bulk-migration.md).
      // NEVER add an entry: new code declares, serves and reads through
      // network/live. Each file sits under the LAST wave or item that still
      // needs it (· names the resources that keep it there), and each wave's
      // barrier deletes its group. Wave 7 moves only substrate, so it has none.
      // What is left is the tree (item 3) — the living inventory of that item
      // (the revision ticks, item 7, and config have migrated).

      // Item 3 (tree) — stays until the tree migrates.
      // · agent-launches
      "plugins/conversations/plugins/agents/shared/resources.ts",
      "plugins/conversations/plugins/agents/web/components/agent-avatar-row.tsx",
      "plugins/conversations/plugins/agents/web/components/agent-avatar-title-prefix.tsx",
      "plugins/conversations/plugins/agents/web/components/agent-detail.tsx",
      "plugins/conversations/plugins/agents/web/components/agent-launches.tsx",
      "plugins/conversations/plugins/agents/web/components/agent-status.tsx",
      // · agent-launches, conversations-active
      "plugins/conversations/plugins/agents/server/internal/resources.ts",
      // · attempts
      "plugins/tasks/plugins/attempt-view/web/components/attempt-pane.tsx",
      "plugins/tasks/plugins/attempt-view/web/components/attempt-switch-button.tsx",
      "plugins/tasks/plugins/attempt-view/web/panes.tsx",
      "plugins/tasks/plugins/tasks-core/web/hooks.ts",
      // · attempts, conversations-active, conversations-gone,
      //   conversations-system, the pushes carrier (pushes.attempts-cascade from
      //   Wave 4), tasks
      "plugins/tasks/plugins/tasks-core/core/resources.ts",
      "plugins/tasks/plugins/tasks-core/server/internal/resources.ts",
      // · attempts, tasks
      "plugins/active-data/plugins/attempt/web/components/attempt-chip.tsx",
      "plugins/tasks/plugins/worktree-identity/web/internal/use-worktree-identity.ts",
      // · conversations-active, conversations-gone, conversations-system
      "plugins/conversations/plugins/conversation-view/web/panes.tsx",
      "plugins/conversations/web/use-conversations.ts",
      // · conversations-active, conversations-gone, tasks
      "plugins/conversations/plugins/conversations-view/plugins/data-view/plugins/queue/web/components/use-queue-rows.ts",
      // · conversations-gone
      "plugins/conversations/plugins/recover/web/components/recovery-view.tsx",
      // · task-categories
      "plugins/tasks/plugins/task-category/server/internal/resource.ts",
      "plugins/tasks/plugins/task-category/shared/resources.ts",
      "plugins/tasks/plugins/task-category/web/hooks.ts",
      // · tasks
      "plugins/active-data/plugins/task-link/web/components/task-link-chip.tsx",
      "plugins/active-data/plugins/task/web/components/task-card.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/dependencies/web/components/dependencies-button.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/add-task/web/components/add-task-tool-view.tsx",
      "plugins/page/plugins/annotations/plugins/todo/plugins/task-link/web/hooks.ts",
      "plugins/tasks/plugins/task-dependencies/web/components/task-dependencies.tsx",
      "plugins/tasks/plugins/task-deps-tree/web/components/deps-tree-section.tsx",
      "plugins/tasks/plugins/task-detail/web/panes.tsx",
      "plugins/tasks/plugins/task-draft-form/web/components/task-draft-popover.tsx",
      "plugins/tasks/plugins/task-graph/web/hooks.ts",
      "plugins/tasks/plugins/task-list/web/components/child-count-action.tsx",
      "plugins/tasks/plugins/task-list/web/components/tasks-list-view.tsx",
      "plugins/tasks/web/client.ts",

      // (c) DECLARED LEGACY-FULL (item 9) — the readers of the two page
      // resources, which stay on the legacy spelling (and reload in full)
      // until item 9 migrates them. Not burndown: no wave deletes this group.
      // `live:legacy-descriptors-pinned` (network/live check) pins the
      // resources themselves — `pagesResource` and `pageLinksResource` are
      // the only `resourceDescriptor(` calls — so no NEW legacy resource can
      // be declared. It does not pin this group's membership or what these
      // files read: an entry here is exempt from every legacy spelling, like
      // any other ignore. Add one only for a new reader of the two page
      // resources, never to read anything else.
      // · page-links
      "plugins/page/plugins/links/core/resources.ts",
      "plugins/page/plugins/links/server/internal/resources.ts",
      // · page-links, pages
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/pages-sidebar.tsx",
      // · pages
      "plugins/active-data/plugins/page-link/web/components/page-link-chip.tsx",
      "plugins/apps/plugins/pages/plugins/page-author/web/components/page-kind-control.tsx",
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/delete-page-action.tsx",
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/page-breadcrumb.tsx",
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/page-cover.tsx",
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/page-header.tsx",
      "plugins/apps/plugins/pages/plugins/page-tree/web/internal/block-target.ts",
      "plugins/apps/plugins/pages/plugins/page-tree/web/panes.tsx",
      "plugins/apps/plugins/pages/plugins/prompt-origin/web/components/prompt-origin-section.tsx",
      "plugins/apps/plugins/pages/plugins/welcome/plugins/recent-pages/web/components/recent-pages-section.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/page-tools/web/components/page-ref-chip.tsx",
      "plugins/page/plugins/annotations/plugins/instructions/plugins/instructions-page/web/components/instructions-page-chip.tsx",
      "plugins/page/plugins/editor/core/resources.ts",
      "plugins/page/plugins/editor/server/internal/resources.ts",
      "plugins/page/plugins/editor/web/components/page-options.tsx",
      "plugins/page/plugins/inline-page-link/web/components/page-link-chip.tsx",
      "plugins/page/plugins/inline-page-link/web/components/page-link-inline-node.tsx",
      "plugins/page/plugins/page-link/web/components/page-link-block.tsx",
    ],
  },
};
