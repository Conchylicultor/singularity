import { isServableCompositionId } from "./namespace";
import type { CompositionManifestItem } from "./manifest-map";

/**
 * The ONE definition of "activated": which stored manifests compose-serve is to
 * provision a namespace for at the end of a main build.
 *
 * It lives here, beside the manifest item type and the namespace vocabulary,
 * rather than in the compose-serve CLI module that used to own it — the
 * serve-composition reset guard needs the same answer and cannot import a CLI
 * module, so it hand-rolled a second copy of the filter. Two spellings of
 * "activated" is exactly the drift that lets a guard and the stage it guards
 * disagree.
 */
export function activatedCompositionIds(
  items: CompositionManifestItem[],
): string[] {
  // "Activated" = servable AND opted in. `autoBuild` is a field on a homogeneous
  // list, so main's row cannot be made to LACK it — but it can be made unable to
  // matter. Filtering on servability here means a stored `autoBuild: true` on
  // main's row, from any config layer, has no path to compose-serve at all,
  // rather than being caught downstream by a throw.
  return items
    .filter((i) => i.autoBuild && isServableCompositionId(i.id))
    .map((i) => i.id);
}
