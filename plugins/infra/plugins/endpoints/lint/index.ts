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

      // The (c) BURNDOWN list is now empty — every legacy holdout has been
      // migrated to a typed endpoint. Do NOT add new entries here; the rule
      // must stay green by migrating to fetchEndpoint/useEndpoint, not exempting.
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

    ],
  },
};
