import { isServableCompositionId } from "./namespace";
import { isServed } from "./serve-mode";
import type { CompositionManifestItem } from "./manifest-map";

/**
 * The ONE definition of "activated": which stored manifests are DECLARED as
 * meant to be served.
 *
 * It is intent, not liveness — this answers "which compositions did someone say
 * should be live here?", and the `composition.json` marker is the only answer to
 * "which are live". Something does act on the intent: on the main checkout, the
 * build convergence loop rebuilds a served composition at the rate its mode
 * allows. But an automatic rebuild only ever refreshes a namespace someone
 * already claimed with an explicit serve, so this list is still a declaration
 * rather than a set of live namespaces.
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
  // "Activated" = servable AND opted in. `serve` is a field on a homogeneous
  // list, so main's row cannot be made to LACK it — but it can be made unable to
  // matter. Filtering on servability here means a stored non-`off` mode on
  // main's row, from any config layer, can never name a namespace to provision,
  // rather than being caught downstream by a throw.
  return items
    .filter((i) => isServed(i.serve) && isServableCompositionId(i.id))
    .map((i) => i.id);
}
