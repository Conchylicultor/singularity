import { isServableCompositionId } from "./namespace";
import type { CompositionManifestItem } from "./manifest-map";

/**
 * The ONE definition of "activated": which stored manifests are DECLARED as
 * meant to be served.
 *
 * It is intent, and since the compose-serve stage was deleted nothing acts on it
 * automatically — a serve is now an explicit `./singularity build --composition
 * <id>` of one checkout. So this answers "which compositions did someone say
 * should be live here?", not "which are live"; the `composition.json` marker is
 * the only answer to the second question. Re-wiring the intent to a trigger is
 * Phase 6 of research/2026-08-17-global-composition-build-serve-model.md.
 *
 * It lives here, beside the manifest item type and the namespace vocabulary,
 * rather than in the CLI module that used to own it — the serve-composition
 * reset guard needs the same answer and cannot import a CLI module, so it
 * hand-rolled a second copy of the filter. Two spellings of "activated" is
 * exactly the drift that lets a guard and the thing it guards disagree.
 */
export function activatedCompositionIds(
  items: CompositionManifestItem[],
): string[] {
  // "Activated" = servable AND opted in. `autoBuild` is a field on a homogeneous
  // list, so main's row cannot be made to LACK it — but it can be made unable to
  // matter. Filtering on servability here means a stored `autoBuild: true` on
  // main's row, from any config layer, can never name a namespace to provision,
  // rather than being caught downstream by a throw.
  return items
    .filter((i) => i.autoBuild && isServableCompositionId(i.id))
    .map((i) => i.id);
}
