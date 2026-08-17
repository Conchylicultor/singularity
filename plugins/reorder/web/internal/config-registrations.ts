import { ConfigV2 } from "@plugins/config_v2/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { subscribeSlotsDeclared } from "@plugins/framework/plugins/slot-declaration/core";
import {
  reorderDescriptorEntries,
  syncReorderDescriptors,
} from "./descriptors";

/**
 * One `ConfigV2.WebRegister` contribution per reorderable slot, each planted
 * under the slot's DECLARING plugin via `pluginId`. The descriptor instances
 * come from the shared map — the SAME objects the middleware looks up for
 * `useConfig`/`useSetConfig` (reference identity).
 *
 * A STABLE array rewritten in place on every declaration pass, rather than a
 * value computed once at module eval. Two reasons, and the second is the
 * load-bearing one:
 *
 *  - The set is not knowable at module eval. Web plugins are imported
 *    concurrently and, after first paint, in deferred TIERS — so at the instant
 *    this module evaluates, most slots do not exist yet.
 *  - A slot's owner is settled by the declaration pass, not by its constructor.
 *    That pass runs inside `PluginProvider` immediately BEFORE it reads every
 *    plugin's `contributions`, so re-deriving from it is exactly in time, every
 *    time — including for each deferred batch.
 *
 * Built here (not in the barrel) so `web/index.ts` stays loop-free per the
 * barrel-purity rule.
 */
export const reorderConfigContributions: Contribution[] = [];

subscribeSlotsDeclared((owners) => {
  syncReorderDescriptors(owners);
  reorderConfigContributions.length = 0;
  for (const entry of reorderDescriptorEntries) {
    reorderConfigContributions.push(
      ConfigV2.WebRegister({
        descriptor: entry.descriptor,
        pluginId: entry.pluginId,
      }),
    );
  }
});
