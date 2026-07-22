/**
 * Pure-logic tests for the compositions config: the seeded `default` items parse
 * against the descriptor schema, map to valid `CompositionManifest`s via the
 * mapper, and the agent-manager full-vs-lean pair realises the vision's anchor
 * demo (their flattened `selectedContributors` set-difference IS exactly the
 * self-improvement PACK, now pulled in via first-class `extends`). No generated
 * registry, no server. Run with:
 *   bun test plugins/plugin-meta/plugins/composition/core/config.test.ts
 */
import { test, expect } from "bun:test";
import { flattenManifest } from "@plugins/plugin-meta/plugins/closure/core";
import { compositionsConfig } from "./config";
import { manifestItemToManifest, type CompositionManifestItem } from "./manifest-map";

const seeds = compositionsConfig.defaults.manifests as CompositionManifestItem[];
const registry = seeds.map(manifestItemToManifest);

const SELF_IMPROVEMENT = [
  "improve.element-picker",
  "review",
  "reports.crash",
  "reports.launch-fix",
  "screenshot.draw-on-app",
];

const byName = (name: string): CompositionManifestItem => {
  const m = seeds.find((x) => x.name === name);
  if (!m) throw new Error(`seed composition "${name}" not found`);
  return m;
};

test("the seeded default parses against the descriptor schema", () => {
  const parsed = compositionsConfig.schema.safeParse(compositionsConfig.defaults);
  expect(parsed.success).toBe(true);
});

test("every seed carries a distinct id (array position is the order)", () => {
  const ids = seeds.map((s) => s.id);
  expect(new Set(ids).size).toBe(seeds.length);
});

test("the taxonomy is populated: app, profile, subsystem, and pack seeds all exist", () => {
  const categories = new Set(seeds.map((s) => s.category));
  for (const c of ["app", "profile", "subsystem", "pack"]) {
    expect(categories.has(c)).toBe(true);
  }
  // The two agent-manager flavors are profiles; self-improvement is a pack.
  expect(byName("agent-manager").category).toBe("profile");
  expect(byName("agent-manager-lean").category).toBe("profile");
  expect(byName("self-improvement").category).toBe("pack");
});

test("each seed maps to a valid CompositionManifest via the mapper", () => {
  for (const item of seeds) {
    const m = manifestItemToManifest(item);
    expect(typeof m.name).toBe("string");
    expect(m.name.length).toBeGreaterThan(0);
    expect(Array.isArray(m.entryPoints)).toBe(true);
    expect(Array.isArray(m.selectedContributors)).toBe(true);
    expect(m.selectedContributors.every((id) => typeof id === "string")).toBe(true);
    // Only packs (pure contributor sets) may omit entry points.
    if (item.category !== "pack") {
      expect(m.entryPoints.length).toBeGreaterThan(0);
    }
  }
});

test("the agent-runtime bundle aggregates the agent/worktree/git taproots", () => {
  const ar = byName("agent-runtime");
  expect(ar.category).toBe("subsystem");
  // The deep taproots a self-contained app must never reach, listed as
  // whole-subtree (`.**`) entries so an app's hard closure surfaces them for the
  // disjointness check.
  for (const id of [
    "infra.worktree.**",
    "infra.git-watcher.**",
    "infra.claude-cli.**",
  ]) {
    expect(ar.entryPoints).toContain(id);
  }
  // Reuses the existing conversations/tasks-domain subsystems via `extends`.
  expect([...ar.extends].sort()).toEqual(["conversations", "tasks-domain"]);
});

test("the website app seed uses the glob grammar to take the site subtree minus blog / editor-toy", () => {
  const site = byName("website");
  expect(site.category).toBe("app");
  const m = manifestItemToManifest(site);
  expect(typeof m.name).toBe("string");
  expect(m.name.length).toBeGreaterThan(0);
  expect(m.entryPoints.length).toBeGreaterThan(0);
  // The regression guard, stated in the new glob grammar: `.**` takes the whole
  // site subtree, then two negatives trim the branches that would drag in the
  // Pages app + block editor + worktree infra (blog/pages-integration and the
  // editor-toy demo). The "actually absent from the bundle" regression lives in
  // closure.test.ts (with a real plugin tree); here we only assert the grammar.
  const entries = m.entryPoints.map(String);
  expect(entries).toContain("apps.website.**");
  expect(entries).toContain("!apps.website.blog.**");
  expect(entries).toContain("!apps.website.demos.editor-toy.**");
});

test("served-baseline forces the toast host alongside health", () => {
  // The toast host must ship with every gateway-served app: health's Core.Root
  // watchers dispatch toasts, and with no `<ToasterHost/>` mounted those toasts
  // would silently vanish. Forcing `shell.toast` as a served-baseline entry keeps
  // the "host ships with any served app" invariant enforced (facet-a regression
  // guard) without relying on a runtime throw.
  const baseline = byName("served-baseline");
  expect(baseline.entryPoints).toContain("infra.health.**");
  expect(baseline.entryPoints).toContain("shell.toast.**");
});

test("every seed carries `excludes` and each ref resolves to a real bundle", () => {
  const names = new Set(seeds.map((s) => s.name));
  for (const s of seeds) {
    // The self-containment guard field is present on every seed (default []).
    expect(Array.isArray(s.excludes)).toBe(true);
    // Every declared exclusion names a real composition (the check enforces
    // disjointness against it). No app opts in yet — see config.ts — but the
    // mechanism stays validated.
    for (const ref of s.excludes) expect(names.has(ref)).toBe(true);
  }
});

test("every seed carries `autoBuild` (default off) and the mapper drops it", () => {
  for (const s of seeds) {
    // The compose-serve opt-in flag is present on every seed, defaulting off.
    expect(typeof s.autoBuild).toBe("boolean");
    expect(s.autoBuild).toBe(false);
    // Engine-opaque: `manifestItemToManifest` drops it exactly like `category` /
    // `excludes`, so the resolved `CompositionManifest` never carries it.
    const m = manifestItemToManifest(s);
    expect("autoBuild" in m).toBe(false);
  }
});

test("the self-improvement pack holds exactly the self-improvement set", () => {
  const pack = manifestItemToManifest(byName("self-improvement"));
  expect([...pack.selectedContributors].map(String).sort()).toEqual(
    [...SELF_IMPROVEMENT].sort(),
  );
  expect(pack.entryPoints.length).toBe(0);
});

test("anchor demo: flattened full \\ lean is exactly the self-improvement pack", () => {
  // Full extends the self-improvement pack; lean does not. After flattening the
  // `extends` chain against the registry, the contributor set-difference is the
  // pack's contributors (order-independent).
  const full = flattenManifest(manifestItemToManifest(byName("agent-manager")), registry);
  const lean = flattenManifest(
    manifestItemToManifest(byName("agent-manager-lean")),
    registry,
  );

  const diff = full.selectedContributors.filter(
    (c) => !lean.selectedContributors.includes(c),
  );
  expect([...diff].map(String).sort()).toEqual([...SELF_IMPROVEMENT].sort());

  // Lean's contributors are a strict subset of full's flattened contributors.
  for (const c of lean.selectedContributors) {
    expect(full.selectedContributors).toContain(c);
  }
});
