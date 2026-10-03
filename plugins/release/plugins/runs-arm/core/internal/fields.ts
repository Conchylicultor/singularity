import { z } from "zod";
import { liveArmColumns } from "@plugins/network/plugins/live/core";
import {
  liveBoolean,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { ReleaseRunSchema } from "@plugins/release/core";
import { runs } from "@plugins/runs/core";

/**
 * This arm's name, in one place: the kind string is the server's discriminator,
 * the list row's dispatch key, the field extension's id, and the `kind` half of
 * the `{ kind, id }` pair a surface builds to highlight a selected row. A rename
 * with literals in each spot breaks the highlight silently.
 *
 * It is this arm's column set's arm (`liveArmColumns`), so every wire name
 * (`release.<field>`) and every row key (`release:<id>`) is prefixed by it.
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
 * The columns only a release row has — its slice of the `runs` union
 * (`$columns.release`), wire names `release.<field>`.
 *
 * **`kind` is why the wire names are prefixed.** `release_runs` has a `kind`
 * column of its own — `staged` (a `--dev` run, previewable only) vs
 * `candidate` (packed for a named platform, shippable) — meaning something
 * entirely different from the run *kind* the whole union is discriminated on.
 * As `release.kind` the two sit side by side in one filter bar.
 *
 * `composition` and `target` are columns even though `label` already joins
 * them: a label is text a person reads, and these are dimensions a person
 * filters and groups by.
 */
export const releaseRunColumns = liveArmColumns(runs, RELEASE_RUN_KIND, {
  row: z.object({
    kind: ReleaseRunSchema.shape.kind,
    composition: z.string(),
    target: z.string(),
    platform: z.string().nullable(),
    commitSha: z.string().nullable(),
    commitDirty: z.boolean().nullable(),
    artifactPath: z.string().nullable(),
  }),
  filterable: {
    kind: liveText(),
    composition: liveText(),
    target: liveText(),
    platform: liveText(),
    commitSha: liveText(),
    commitDirty: liveBoolean(),
    artifactPath: liveText(),
  },
  sortable: ["kind", "composition", "target", "platform"],
});
