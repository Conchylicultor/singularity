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
      // Sanctioned NDJSON streaming-reader primitive (readNdjson) — streaming
      // can't go through fetchEndpoint's single-JSON-response model.
      "plugins/infra/plugins/ndjson-stream/web/**",

      // (b) PERMANENT — special transport that implement()/fetchEndpoint can't
      // express. Do NOT migrate these.
      // The live-state primitive's own resource GET — this IS the primitive that
      // useEndpoint resources are built on; it cannot depend on itself.
      "plugins/primitives/plugins/live-state/web/use-resource.ts",
      // Same live-state resource GET, in the client that owns the version-guarded
      // cache write: `primeFromHttp` is the cold-start HTTP prime of the same
      // `/api/resources/:key` route as use-resource's queryFn, kept here because
      // the write needs the client's private sub/schema state (and this file
      // cannot import use-resource — that would be a cycle). Same primitive, same
      // untyped per-resource route, same self-dependency exemption.
      "plugins/primitives/plugins/live-state/web/notifications-client.ts",

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
      "plugins/shell/plugins/notifications/web/components/bell-button.tsx",
      // Secondary DB persistence of a toast already shown via Shell.Toast.
      "plugins/shell/plugins/notifications/web/internal/toast.ts",
      // Page-tree expand toggle + DnD reorder; blocksLiveResource push refreshes.
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/pages-sidebar.tsx",
      // Track color/instrument/mute/hide toggles + reset; live-state push refreshes.
      "plugins/apps/plugins/sonata/plugins/track-mixer/web/actions.ts",
      // Debounced chord-grid autosave; in-context state is source of truth, the
      // next keystroke retries.
      "plugins/apps/plugins/sonata/plugins/sources/plugins/chord-grid/web/components/chord-grid-editor-section.tsx",
      // Debounced Ultimate Guitar autosave; in-context state (the loaded UgTab)
      // is source of truth, the next edit retries.
      "plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/web/components/ug-editor-section.tsx",
      // Play-count telemetry; an off-by-one on failure has no UX consequence.
      "plugins/apps/plugins/sonata/plugins/playback-history/web/components/record-play-observer.tsx",
      // Per-song key-auto-detect toggle; set optimistically on the shell store
      // first, and the keyAutoDetectResource push reaffirms it — a failed persist
      // self-corrects on the next toggle.
      "plugins/apps/plugins/sonata/plugins/rich/plugins/key-mode/web/actions.ts",
      // Per-song global transpose offset; set optimistically on the shell store
      // first, and the transposeResource push reaffirms it — a failed persist
      // self-corrects on the next step.
      "plugins/apps/plugins/sonata/plugins/transpose/web/actions.ts",

    ],
  },
};
