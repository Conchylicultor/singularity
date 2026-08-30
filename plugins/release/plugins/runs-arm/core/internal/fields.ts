import { defineRunArmFields } from "@plugins/runs/core";

/**
 * This arm's name, in one place: the kind string is the server's discriminator,
 * the list row's dispatch key, the field extension's id, and the `kind` half of
 * the `{ kind, id }` pair a surface builds to highlight a selected row. A rename
 * with literals in each spot breaks the highlight silently.
 *
 * Passing it to `defineRunArmFields` ties the column ids to it: that call throws
 * at module eval if any declared id is not prefixed with this exact string.
 *
 * Unlike the build arm's twin — which had to move down into
 * `run-ledger/core` — this one stays in the arm, and the asymmetry is a
 * decision. That constant closed a cycle: `build/web` needed it AND this arm
 * needs `build/web` for a detail pane. Nothing in `release/{core,server}` can
 * import this arm (the release run-detail pane lives in Studio, and this arm
 * contributes no `open`), so there is no edge back and no cycle to break. If a
 * release-OWNED surface ever needs the string, move it to `release/core` and
 * import it from there — do not re-export it from here, which is banned.
 */
export const RELEASE_RUN_KIND = "release";

/**
 * The columns only a release row has.
 *
 * **`release.kind` is why the namespace prefix exists.** `release_runs` has a
 * `kind` column of its own — `staged` (a `--dev` run, previewable only) vs
 * `candidate` (packed for a named platform, shippable) — and it means something
 * entirely different from the run *kind* the whole union is discriminated on. An
 * unprefixed `kind` here would shadow the discriminator; prefixed, the two can
 * sit side by side in one filter bar and say different things.
 *
 * `release.composition` and `release.target` are declared even though `label`
 * already joins them: a label is text a person reads, and these are dimensions a
 * person filters and groups by. "Every release of sonata" is a filter on the
 * composition, not a substring of the title.
 */
export const releaseRunArmFields = defineRunArmFields(RELEASE_RUN_KIND, {
  "release.kind": { type: "enum", sqlType: "text" },
  "release.composition": { type: "text", sqlType: "text" },
  "release.target": { type: "text", sqlType: "text" },
  "release.platform": { type: "text", sqlType: "text", nullable: true },
  "release.commitSha": { type: "text", sqlType: "text", nullable: true },
  "release.commitDirty": { type: "bool", sqlType: "boolean", nullable: true },
  "release.artifactPath": { type: "text", sqlType: "text", nullable: true },
});
