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
      // Item ids are durable keys: the Studio detail pane routes on `comp/:id`.
      stableIdentity: true,
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
        // The linchpin edge is now CUT: infra.health no longer hard-imports
        // reports (its wedge watchdog emits onto a neutral report-sink that
        // reports.crash registers into), so served-baseline no longer drags
        // reports/tasks/build/git-watcher into every served app's hard closure.
        // Sonata is the worked proof — it `excludes` both the `agent-runtime`
        // bundle and `auth`, and the composition-closure check enforces the
        // disjointness. Rolling the same excludes out to the other served apps is
        // a follow-up. The guard mechanism is live; see
        // plugins/.../checks/.../composition-closure.
        app("sonata", "a6", "apps.sonata", ["data-views"], ["agent-runtime", "auth"]),
        app("story", "a7", "apps.story"),
        app("debug", "a8", "apps.debug"),
        app("deploy", "a9", "apps.deploy"),
        app("file-explorer", "aA", "apps.file-explorer"),
        app("workflows", "aB", "apps.workflows"),

        // The public equin site. Two non-obvious choices below:
        //  1. It deliberately does NOT entry the `apps.website` umbrella.
        //     `expandEntrySeeds` seeds an entry PLUS its whole subtree, and
        //     `apps.website.blog.pages-integration` hard-imports
        //     `@plugins/apps/plugins/pages/plugins/page-tree/web` (it mounts an
        //     authoring panel into the Pages app). Entrying the umbrella would drag
        //     the Pages app + block editor into the public site. The manifest
        //     vocabulary is additive-only — there is no way to subtract it — so we
        //     entry the sub-umbrellas individually and omit the whole `blog`
        //     umbrella (the blog is being retired anyway; it is the site's only
        //     server plugin and its only `page` dependency).
        //  2. `selectedContributors: ["apps.sonata.audio.piano"]` is the sampled
        //     grand behind the app-gallery's Sonata vignette — a genuine
        //     load-bearing soft option: it contributes `SonataAudio.Instrument`
        //     (the axis that lives in `apps.sonata.audio.instruments`, NOT in
        //     `sonata/shell`, so embedding a playable instrument does not drag a
        //     second `Apps.App` in), whose owner plugin the vignette hard-imports.
        //  3. The `demos` sub-plugins are entried INDIVIDUALLY (not the `demos`
        //     umbrella), to omit `demos.editor-toy`. editor-toy embeds a live
        //     `<BlockEditor>`, and the block editor's hard closure now reaches
        //     worktree infra: `page.editor → reorder → config_v2.staging →
        //     infra.worktree` (staging lands a promoted config default to git in
        //     the worktree). That drags `infra.worktree` — part of the excluded
        //     `agent-runtime` bundle — into a site meant to be self-contained. A
        //     public site can't ship a live block editor without also shipping the
        //     worktree/git-landing infra behind it, so editor-toy is left out;
        //     every other demo ships. (Making a live editor releasable stand-alone
        //     — severing the reorder→staging→worktree taproot — is a follow-up.)
        // No `app-chrome`: a public site wants no rail and no tab strip
        // (`apps-core.layout` renders a chrome-less surface on its own — same as
        // the `sonata` composition). `excludes` mirrors the sonata precedent
        // (`agent-runtime`, `auth`) — the infra bundles a self-contained public
        // site must ship without.
        //
        // Only bundles that do NOT extend `served-baseline` are excludable. The
        // check compares against the excluded bundle's FLATTENED containment, so
        // excluding an app composition (`pages`, `home`, …) can never pass: its
        // containment always carries the shared baseline (`apps-core.layout`,
        // `infra.health`, `shell.toast`, the token groups) that every app extends.
        // `excludes` names infra bundles — that is the whole vocabulary.
        // NOT `excludes: ["sonata"]` either — the sonata bundle's containment is
        // `apps.sonata` + subtree, which legitimately includes the
        // instruments/keyboard/piano leaves the site bundles.
        {
          id: "website",
          rank: "aB5",
          name: "website",
          category: "app" as const,
          entryPoints: [
            "apps.website.shell",
            "apps.website.landing",
            "apps.website.pillars",
            "apps.website.downloads",
            // Demos entried individually to omit `demos.editor-toy` (see note 3).
            "apps.website.demos.agent-run",
            "apps.website.demos.app-gallery",
            "apps.website.demos.plugin-pyramid",
            "apps.website.demos.release-switcher",
            "apps.website.demos.theme-toy",
          ],
          selectedContributors: ["apps.sonata.audio.piano"],
          extends: ["served-baseline"],
          excludes: ["agent-runtime", "auth"],
        },

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
        // the mandatory Core.Root app SURFACE renderer (apps-core.layout —
        // AppsLayout: the tab bar / rail / tab surface; without it a filtered app
        // boots to a black screen, since it's a graph dead-end nothing hard-imports
        // and so its Core.Root contribution silently vanishes — same "force it in"
        // rationale as the toast host below), the liveness/readiness endpoint the
        // gateway probes, the toast HOST (forced alongside health, whose Core.Root
        // watchers dispatch toasts — without the host mounted those toasts would
        // silently vanish), plus the runtime theme engine and the token groups that
        // supply the base CSS variables (without these a filtered app boots
        // unstyled and fails /api/health). Entry points (not contributors) so
        // they're forced into the hard closure unconditionally; the
        // theme-customizer UI stays opt-in/soft.
        subsystem("served-baseline", "aN5", [
          "apps-core.layout",
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
        // The app-surface CHROME, opt-in and extended by nothing: the tab strip,
        // the app rail (its default `rail` variant), and the multi-placement
        // surface (docked / floating / solo). `apps-core.layout` (in
        // served-baseline) renders a chrome-less surface — tabs + tab-surface
        // substrate only — so a composition ships the tab bar / rail / placements
        // only by `extends`-ing this pack (or selecting individual contributors).
        pack("app-chrome", "aQ", [
          "apps-core.tab-bar",
          "apps-core.app-rail-framing",
          "apps-core.app-rail-framing.rail",
          "apps-core.surface",
          "apps-core.surface.docked",
          "apps-core.surface.floating",
          "apps-core.surface.solo",
        ]),
        // The DataView RENDERING ecosystem: the four view-type renderers plus the
        // per-field-type cell (`DataViewSlots.Cell`) and inline-editor
        // (`DataViewSlots.CellEditor`) contributors. All are `DataViewSlots.*`
        // contributions to `data-view` — graph dead-ends nothing hard-imports (same
        // "force it in" rationale as the toast host / app-chrome). Without them a
        // released DataView has ZERO registered view types, so `buildInstanceFromRow`
        // fail-soft-skips every config-authored view row and the surface renders
        // "No views configured" even though the config value ships. Any app hosting
        // a `<DataView>` `extends` this pack. (Config-authored views live in
        // config_v2; this pack makes the RENDERERS available — the two are
        // orthogonal.)
        //
        // Plus the Filter-pill (`DataViewSlots.Filter`), typed value-codec
        // (`DataViewSlots.ValueCodec`), and enum column-config
        // (`DataViewSlots.ColumnConfig`) contributors. These are now selectable
        // after the static-parser fix (the closure parser used to drop any
        // contribution whose argument was a pre-built const rather than an inline
        // object literal, so `composition-closure` rejected them as "not a genuine
        // soft option"). Carrying them here keeps a released DataView's filtering
        // and typed codecs working instead of fail-soft degrading to identity.
        pack("data-views", "aR", [
          "primitives.data-view.gallery",
          "primitives.data-view.table",
          "primitives.data-view.list",
          "primitives.data-view.tree",
          "fields.bool.table",
          "fields.color.table",
          "fields.date.table",
          "fields.enum.table",
          "fields.image.table",
          "fields.number.table",
          "fields.tags.table",
          "fields.text.table",
          "fields.bool.inline",
          "fields.date.inline",
          "fields.enum.inline",
          "fields.number.inline",
          "fields.tags.inline",
          "fields.text.inline",
          "fields.bool.filter",
          "fields.date.filter",
          "fields.enum.filter",
          "fields.number.filter",
          "fields.tags.filter",
          "fields.text.filter",
          "fields.bool.data-view-codec",
          "fields.date.data-view-codec",
          "fields.number.data-view-codec",
          "fields.enum.column-config",
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
