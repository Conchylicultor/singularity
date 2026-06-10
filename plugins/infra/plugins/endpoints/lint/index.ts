import noRawWebFetch from "./no-raw-web-fetch";

export default {
  name: "endpoints",
  rules: {
    "no-raw-web-fetch": noRawWebFetch,
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
  },
};
