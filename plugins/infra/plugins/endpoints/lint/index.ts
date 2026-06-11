import noRawWebFetch from "./no-raw-web-fetch";
import noVoidFetchEndpoint from "./no-void-fetch-endpoint";

export default {
  name: "endpoints",
  rules: {
    "no-raw-web-fetch": noRawWebFetch,
    "no-void-fetch-endpoint": noVoidFetchEndpoint,
  },
  ignores: {
    "no-raw-web-fetch": [
      // (a) PERMANENT — primitives that legitimately wrap fetch(). These ARE the
      // sanctioned low-level transport the rest of the app is forbidden from
      // reaching for directly.
      "plugins/primitives/plugins/networking/web/**",
      "plugins/infra/plugins/endpoints/web/**",

      // (b) PERMANENT — special transport that implement()/fetchEndpoint can't
      // express. Do NOT migrate these.
      // NDJSON stream reader built on top of the endpoint contract (it consumes
      // endpoint route/interpolatePath and reports via EndpointError) — streaming
      // can't go through fetchEndpoint's single-JSON-response model.
      "plugins/debug/plugins/worktree-cleanup/web/internal/read-ndjson.ts",
      // The live-state primitive's own resource GET — this IS the primitive that
      // useEndpoint resources are built on; it cannot depend on itself.
      "plugins/primitives/plugins/live-state/web/use-resource.ts",

      // (c) BURNDOWN — legacy holdouts to migrate to typed endpoints and then
      // remove from this list. Tracked by task-1781117125527-ygvwcu. Do NOT add
      // new entries here; the rule must stay green by migrating, not exempting.
      "plugins/debug/plugins/profiling/plugins/build/web/components/build-detail.tsx",
      "plugins/debug/plugins/profiling/plugins/push/web/components/push-detail.tsx",
      "plugins/auth/web/connect.ts",
      "plugins/active-data/web/internal/use-active-data-binding.ts",
      "plugins/apps/plugins/sonata/plugins/sources/plugins/midi/web/hydrate.ts",
      "plugins/code-explorer/plugins/file-resolve/web/internal/use-resolved-file.ts",
      "plugins/conversations/plugins/summary/web/components/summary-pane.tsx",
      "plugins/conversations/plugins/conversation-category/web/internal/api.ts",
      "plugins/conversations/plugins/conversation-view/plugins/commits-graph/web/use-commit-files.ts",
      "plugins/conversations/plugins/conversation-view/plugins/push-profiling/web/components/push-profiling-pane.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/allow-monitor/web/components/allow-monitor-chip.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/dependencies/web/components/dependencies-button.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/resume/web/components/resume-button.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web/use-file-content.ts",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/indexes/web/components/indexes-section.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/prompt-input/web/components/prompt-input.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/columns/web/components/columns-section.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web/use-diff-tokens.ts",
      "plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web/use-file-diff.ts",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/row-count/web/components/row-count-section.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/sample-rows/web/components/sample-rows-section.tsx",
      "plugins/apps/plugins/studio/plugins/contributions/plugins/tables/plugins/foreign-keys/web/components/foreign-keys-section.tsx",
    ],
    "no-void-fetch-endpoint": [
      // PERMANENT — whole-file genuine fire-and-forget: every fetchEndpoint here
      // is a write whose failure is silent + self-correcting (drag/click again)
      // AND whose state refreshes via a live-state push, not the response. This
      // is the sanctioned `void fetchEndpoint()` use named in the endpoints
      // CLAUDE.md. Files with a MIX of fire-and-forget and user-triggered calls
      // are NOT listed here — they carry per-line inline disables instead.
      //
      // DnD edge connect; tasksResource push re-renders the graph.
      "plugins/tasks/plugins/task-graph/web/components/task-graph.tsx",
      // Notification dismiss / mark-read — the CLAUDE.md canonical example;
      // reappears on next load if the write fails.
      "plugins/notifications/web/components/bell-button.tsx",
      // Secondary DB persistence of a toast already shown via Shell.Toast.
      "plugins/notifications/web/internal/toast.ts",
      // Page-tree expand toggle + DnD reorder; blocksLiveResource push refreshes.
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/pages-sidebar.tsx",
      // Track color/instrument/mute/hide toggles + reset; live-state push refreshes.
      "plugins/apps/plugins/sonata/plugins/track-mixer/web/actions.ts",
      // Debounced chord-grid autosave; in-context state is source of truth, the
      // next keystroke retries.
      "plugins/apps/plugins/sonata/plugins/sources/plugins/chord-grid/web/components/chord-grid-editor-section.tsx",
      // Play-count telemetry; an off-by-one on failure has no UX consequence.
      "plugins/apps/plugins/sonata/plugins/playback-history/web/components/record-play-observer.tsx",

      // BURNDOWN — user-triggered mutations that should surface a toast; migrate
      // to useEndpointMutation and remove from this list. Tracked by
      // task-1781184772731-0e1w2e. Do NOT add new entries here; keep the rule
      // green by migrating, not exempting. (Mixed files carry their BURNDOWN
      // lines as inline disables tagged with the same task.)
      "plugins/ui/plugins/tweakcn/plugins/community-browser/web/components/community-browser-section.tsx",
      "plugins/conversations/plugins/conversations-view/plugins/queue/web/components/queue-view.tsx",
      "plugins/apps/plugins/sonata/plugins/library/web/components/song-card.tsx",
    ],
  },
};
