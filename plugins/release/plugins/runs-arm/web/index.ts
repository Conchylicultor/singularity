import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Runs } from "@plugins/runs/web";
import { RELEASE_RUN_KIND } from "../core";
import { ReleaseRunFields } from "./components/release-run-fields";

export default {
  description:
    "The release arm's presence on the merged run surface: the Release kind, plus the composition / target / platform / provenance columns only a release row has. Contributes no row activation — the release run-detail pane hangs off a composition pane keyed by a config-item id the ledger row does not carry.",
  contributions: [
    // No `open`. See CLAUDE.md: `releaseDetailPane` sits under
    // `compositionDetailPane`, whose `:id` is the compositions **config item
    // id** (a uuid), while `release_runs.composition` is the composition
    // **name**. The merged row carries no uuid, and `open` is a plain callback
    // that cannot read the manifest to resolve one. A row that does not activate
    // is honest; a click that silently does nothing is not.
    Runs.Kind({ kind: RELEASE_RUN_KIND, label: "Release" }),
    Runs.Fields({ id: RELEASE_RUN_KIND, component: ReleaseRunFields }),
  ],
} satisfies PluginDefinition;
