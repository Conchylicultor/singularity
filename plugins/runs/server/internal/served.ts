import { serveUnionCollection } from "@plugins/network/plugins/live/server";
import { runs } from "../../core";
import { getRunKinds } from "./registry";

/**
 * The merged run space, served: every registered run kind as one arm of the
 * `runs` union window. Read once, at the deferred bind — after the register
 * phase, where each arm's `defineRunKind` registers — so an arm is never
 * missed by a compile that ran before it registered.
 */
export const runsServed = serveUnionCollection(runs, {
  arms: () => getRunKinds().map((k) => k.binding),
});
