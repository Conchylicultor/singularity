import { defineConfig } from "@plugins/config_v2/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { stringListField } from "@plugins/fields/plugins/string-list/plugins/config/core";

// The composition manifest registry — plain editable data in config_v2 (no
// codegen, no barrels). Each item is a `CompositionManifest`
// (`{ name, entryPoints, selectedContributors, extends }`, owned by `closure`)
// plus a `category` (organisation metadata, NOT consumed by the engine) and the
// list field's `id` / `rank` identity. Runtime-editable from the Studio
// compositions pane; `promotableToGit` lets a git-promotion land an edited set
// as the committed default.
//
// ── Categories (the taxonomy the seeds populate) ──────────────────────────────
//   app        — one per top-level Apps.App: the releasable products. Entry is the
//                app shell umbrella; an empty contributor list is the lean baseline.
//   profile    — a variant of ONE app along the self-improvement axis (the worked
//                example is agent-manager full vs. lean).
//   subsystem  — an infra closure used as a building block / inspection lens, never
//                released alone (data, jobs-events, live-state, auth, …).
//   pack       — a reusable, entry-less contributor SET that apps opt into via
//                `extends` (first-class composition reference; resolved by
//                `flattenManifest` before closure). `self-improvement` is the pack
//                the agent-manager profile demonstrates.
//
// Code defaults carry an EXPLICIT stable `id` + `rank` (the UI only auto-injects
// those on "Add"), so seeded rows are editable and ordered. The rank strings are
// the leading fractional-index keys (`Rank.between` chain: a0, a1, a2, …).
export const compositionsConfig = defineConfig({
  name: "compositions",
  promotableToGit: true,
  fields: {
    manifests: listField({
      label: "Compositions",
      itemFields: {
        name: textField({ label: "Name" }),
        category: enumField({
          label: "Category",
          options: ["app", "profile", "subsystem", "pack"],
          default: "app",
        }),
        entryPoints: stringListField({ label: "Entry points" }),
        selectedContributors: stringListField({ label: "Contributors" }),
        extends: stringListField({ label: "Extends" }),
        // The dual of `extends`: bundle NAMES this composition's hard closure must
        // stay DISJOINT from. Engine-opaque metadata (NOT a `CompositionManifest`
        // field — resolution stays additive-only); the `composition-closure` check
        // enforces disjointness against each named bundle's containment. Lets an
        // app declare it is self-contained (e.g. excludes `agent-runtime`/`auth`).
        excludes: stringListField({ label: "Excludes" }),
      },
      default: [
        // ── Profiles: the agent-manager worked example (full vs. lean) ──────────
        // Full = lean + the self-improvement PACK (first-class `extends`, replacing
        // the formerly-inlined ids). full \ lean is still exactly the pack's set —
        // now sourced through the reference rather than duplicated here.
        {
          id: "agent-manager",
          rank: "a0",
          name: "agent-manager",
          category: "profile",
          entryPoints: ["apps.agent-manager"],
          selectedContributors: [
            "tasks.attempt-view",
            "ui.theme-toggle",
          ],
          extends: ["self-improvement", "served-baseline"],
          excludes: [] as string[],
        },
        {
          id: "agent-manager-lean",
          rank: "a1",
          name: "agent-manager-lean",
          category: "profile",
          entryPoints: ["apps.agent-manager"],
          selectedContributors: [
            "tasks.attempt-view",
            "ui.theme-toggle",
          ],
          extends: ["served-baseline"],
          excludes: [] as string[],
        },

        // ── Apps: lean baseline (entry only) for every other top-level app ──────
        app("home", "a2", "apps.home"),
        app("pages", "a3", "apps.pages"),
        app("settings", "a4", "apps.settings"),
        app("studio", "a5", "apps.studio"),
        // NOTE: no app `excludes` the `agent-runtime` bundle YET. Today EVERY
        // served app's closure pulls it in via served-baseline → infra.health →
        // reports → tasks/build → git-watcher (one hard edge). Opt apps in once
        // that coupling is cut (filed follow-up). The guard mechanism is live and
        // ready; see plugins/.../checks/.../composition-closure.
        app("sonata", "a6", "apps.sonata"),
        app("story", "a7", "apps.story"),
        app("debug", "a8", "apps.debug"),
        app("deploy", "a9", "apps.deploy"),
        app("file-explorer", "aA", "apps.file-explorer"),
        app("workflows", "aB", "apps.workflows"),

        // ── Subsystems: infra closures as building blocks / inspection lenses ───
        subsystem("data", "aC", ["database"]),
        subsystem("jobs-events", "aD", [
          "infra.jobs",
          "infra.events",
          "infra.secrets",
        ]),
        subsystem("live-state", "aE", [
          "primitives.live-state",
          "primitives.networking",
        ]),
        subsystem("auth", "aF", ["auth"]),
        subsystem("search", "aG", ["search.engine"]),
        subsystem("history", "aH", ["history.engine"]),
        subsystem("conversations", "aI", ["conversations"]),
        subsystem("tasks-domain", "aJ", ["tasks"]),
        // The agent-runtime infra closure: what a self-contained app must NOT
        // bundle. Reuses the conversations/tasks-domain subsystems via `extends`
        // and adds the deep taproots (worktree / git-watcher / claude-cli) plus
        // the agent-manager app shell. Apps exclude THIS bundle to assert
        // self-containment. `auth` is a SEPARATE bundle (excluded on demand), not
        // folded in here. Listing the taproots as entries is what lets the check
        // catch transitive contamination: an app's hard closure surfaces any
        // taproot it reaches, where it intersects this bundle's containment.
        {
          id: "agent-runtime",
          rank: "aJ5",
          name: "agent-runtime",
          category: "subsystem" as const,
          entryPoints: [
            "infra.worktree",
            "infra.git-watcher",
            "infra.claude-cli",
            "apps.agent-manager",
          ],
          selectedContributors: [] as string[],
          extends: ["conversations", "tasks-domain"],
          excludes: [] as string[],
        },
        subsystem("page-editor", "aK", ["page"]),
        subsystem("fields", "aL", ["fields"]),
        subsystem("design-system", "aM", ["primitives.css"]),
        subsystem("mcp", "aN", ["infra.mcp"]),
        // The reusable baseline EVERY gateway-served app composition `extends`:
        // the liveness/readiness endpoint the gateway probes, the toast HOST
        // (forced alongside health, whose Core.Root watchers dispatch toasts —
        // without the host mounted those toasts would silently vanish), plus the
        // runtime theme engine and the token groups that supply the base CSS
        // variables (without these a filtered app boots unstyled and fails
        // /api/health). Entry points (not contributors) so they're forced into
        // the hard closure unconditionally; the theme-customizer UI stays
        // opt-in/soft.
        subsystem("served-baseline", "aN5", [
          "infra.health",
          "shell.toast",
          "ui.theme-engine",
          "ui.tokens.color-palette",
          "ui.tokens.density",
          "ui.tokens.shape",
          "ui.tokens.type-scale",
          "ui.tokens.font-family",
          "ui.tokens.sidebar-palette",
          "ui.tokens.shadow",
        ]),

        // ── Packs: reusable contributor sets apps opt into via `extends` ────────
        pack("self-improvement", "aO", [
          "improve.element-picker",
          "review",
          "reports.crash",
          "reports.launch-fix",
          "screenshot.draw-on-app",
        ]),
        pack("theming", "aP", [
          "ui.theme-toggle",
          "ui.tweakcn",
          "ui.tweakcn.community-browser",
        ]),
      ],
    }),
  },
});

/**
 * A lean app baseline: entry = the app shell umbrella, nothing soft opted in.
 * Every app is a self-contained, gateway-served composition, so it `extends`
 * `served-baseline` by default — the liveness/readiness endpoint the gateway
 * probes plus the base theme/token groups. `extraExtends` adds further packs.
 */
function app(
  name: string,
  rank: string,
  entry: string,
  extraExtends: string[] = [],
  excludes: string[] = [],
) {
  return {
    id: name,
    rank,
    name,
    category: "app" as const,
    entryPoints: [entry],
    selectedContributors: [] as string[],
    extends: ["served-baseline", ...extraExtends],
    excludes,
  };
}

/** A subsystem closure: one or more infra umbrellas/plugins as entry points. */
function subsystem(name: string, rank: string, entries: string[]) {
  return {
    id: name,
    rank,
    name,
    category: "subsystem" as const,
    entryPoints: entries,
    selectedContributors: [] as string[],
    extends: [] as string[],
    excludes: [] as string[],
  };
}

/** A pack: an entry-less contributor SET other compositions reference via `extends`. */
function pack(name: string, rank: string, contributors: string[]) {
  return {
    id: name,
    rank,
    name,
    category: "pack" as const,
    entryPoints: [] as string[],
    selectedContributors: contributors,
    extends: [] as string[],
    excludes: [] as string[],
  };
}
