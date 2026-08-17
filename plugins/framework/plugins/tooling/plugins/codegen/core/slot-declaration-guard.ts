import { existsSync } from "fs";
import { join, relative } from "path";
import {
  importBarrel,
  registerBarrelStubs,
} from "@plugins/plugin-meta/plugins/barrel-import/core";
import {
  declarePluginSlots,
  declaredSlotSources,
  findUndeclaredSlots,
} from "@plugins/framework/plugins/slot-declaration/core";
import type {
  SlotDeclaringPlugin,
  SlotHandle,
} from "@plugins/framework/plugins/slot-declaration/core";
import { getFacet } from "@plugins/plugin-meta/plugins/facets/core";
import { slotsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { computeDisabledIds } from "./disabled-ids";
import { buildBarrelFreeTree } from "./barrel-free-tree";

/**
 * Load the web runtime the way the browser loads it, and run one declaration
 * pass over it — the build-time twin of what `PluginProvider` does on each
 * render pass, through the very same `declarePluginSlots`, so the two cannot
 * disagree about who owns a slot (or throw differently on a slot two plugins
 * claim).
 *
 * IT MODELS THE REGISTRY, NOT THE FILESYSTEM. A DISABLED plugin is omitted from
 * `web.generated.ts`, so the browser never loads it, never creates its slots and
 * never registers a config descriptor for them. This pass therefore skips it
 * too. Getting that wrong is not cosmetic: the server's descriptors come from
 * the reorderable-slots manifest, which is this same set, so declaring a plugin
 * the browser will not load makes the two runtimes register different descriptor
 * sets — `config-v2:registrations-paired` fails, and the extra descriptor would
 * own a config file nothing on the web side can read.
 *
 * The orphan guard consequently does not cover a disabled plugin's slots. That
 * is the honest scope: a plugin that ships nothing owes nothing. Re-enabling it
 * puts its slots back in the created-set and the guard names any it forgot.
 *
 * This is also the phase boundary the codegen ordering rests on: after it, every
 * web slot exists and every owner is stamped, and NO server barrel has been
 * imported yet. Both the orphan guard and the reorderable-slots manifest read
 * the result.
 *
 * Memoized per root: the barrel imports are ESM-cache hits on a second call, but
 * the declaration pass must run exactly once per process, not once per consumer.
 */
const declaredByRoot = new Map<
  string,
  Promise<ReadonlyMap<string, PluginId>>
>();

export function declareSlotsFromBarrels(
  root: string,
): Promise<ReadonlyMap<string, PluginId>> {
  let cached = declaredByRoot.get(root);
  if (!cached) {
    cached = runDeclarationPass(root);
    declaredByRoot.set(root, cached);
  }
  return cached;
}

async function runDeclarationPass(
  root: string,
): Promise<ReadonlyMap<string, PluginId>> {
  const tree = await buildBarrelFreeTree(root);
  const disabled = computeDisabledIds(tree);
  registerBarrelStubs(root);

  const declaring: SlotDeclaringPlugin[] = [];
  for (const node of tree.byDir.values()) {
    // Not in the registry ⇒ not loaded ⇒ its slots do not exist. Skipping the
    // IMPORT (not just the declaration) is what keeps that true: an imported
    // barrel would put its slots in the created-set with no owner, which the
    // orphan guard would then read as a slot nobody declared.
    if (disabled.has(node.id)) continue;
    const barrelPath = join(node.dir, "web", "index.ts");
    if (!existsSync(barrelPath)) continue;
    const mod = await importBarrel(barrelPath);
    const sources = declaredSlotSources(mod);
    if (!sources) continue;
    declaring.push({ id: node.id, slots: sources });
  }

  // web-sdk has no `web/index.ts` — it IS the web runtime — and declares its own
  // root slots on its core barrel, which `buildPluginTree` also treats as its
  // web module. Same seed, so the two passes see the same set.
  const seedDir = join(root, "plugins/framework/plugins/web-sdk");
  const seedBarrel = join(seedDir, "core", "index.ts");
  const seedNode = tree.byDir.get(seedDir);
  if (seedNode && existsSync(seedBarrel)) {
    const sources = declaredSlotSources(await importBarrel(seedBarrel));
    if (sources) declaring.push({ id: seedNode.id, slots: sources });
  }

  // Throws on a slot two plugins claim; stamps the owner onto each slot object.
  return declarePluginSlots(declaring);
}

/**
 * The created-vs-declared guard: every slot constructed in this process must be
 * declared by exactly one plugin (`PluginDefinition.slots`).
 *
 * WHY HERE. Both sets are complete only where module loading is complete, and
 * this process is the one place that holds: {@link declareSlotsFromBarrels}
 * imports every web barrel. In the browser, web plugins load in TIERS
 * (`web-sdk/core/load-tiers.ts`), so mid-boot `created` and `declared` are both
 * partial and a slot created by an eager module but declared by a deferred
 * plugin would false-positive. The build is the guarantee, not a backstop.
 *
 * WHY IT CANNOT BE FORGOTTEN. `defineSlot` is the single funnel every slot
 * constructor calls, and it appends to the created-set at construction — so this
 * sees every slot that exists, whatever file, factory or nesting depth produced
 * it, with no registry to keep in sync.
 *
 * WHY IT RUNS BEFORE THE REST OF CODEGEN. An undeclared slot is a slot missing
 * from the reorderable-slots manifest, and a missing manifest row is a config
 * descriptor that never registers — which `pruneOrphanedConfigFiles` would read
 * as an orphaned config file and DELETE. Failing here, before any config origin
 * is generated, is what keeps a declaration mistake from costing authored files.
 */
export async function assertSlotsDeclared(root: string): Promise<void> {
  const owners = await declareSlotsFromBarrels(root);
  const orphans = findUndeclaredSlots(owners);
  if (orphans.length === 0) return;
  throw new Error(await renderOrphanReport(root, orphans));
}

/**
 * Where each orphan was CONSTRUCTED, from the barrel-free tree's static parse —
 * the one thing source text knows and the runtime has erased. Built lazily, only
 * on failure.
 */
async function constructedIn(root: string): Promise<Map<string, string>> {
  const tree = await buildBarrelFreeTree(root);
  const bySlotId = new Map<string, string>();
  for (const node of tree.byDir.values()) {
    for (const slot of getFacet(node, slotsFacetDef) ?? []) {
      if (!bySlotId.has(slot.slotId)) {
        bySlotId.set(slot.slotId, relative(root, node.dir));
      }
    }
  }
  return bySlotId;
}

async function renderOrphanReport(
  root: string,
  orphans: readonly SlotHandle[],
): Promise<string> {
  const sources = await constructedIn(root);
  const rows = orphans
    .map((slot) => ({
      id: slot.id,
      kind: slot.meta.kind,
      where: sources.get(slot.id),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const idWidth = Math.max(...rows.map((r) => r.id.length));
  const kindWidth = Math.max(...rows.map((r) => r.kind.length));
  const lines = rows.map(
    (r) =>
      `  ${r.id.padEnd(idWidth)}  ${r.kind.padEnd(kindWidth)}  ` +
      (r.where ?? "(runtime id)"),
  );
  const anyRuntimeId = rows.some((r) => r.where === undefined);

  return [
    `[slots] ${orphans.length} slot(s) exist that no plugin declares.`,
    "",
    "Add each one to the `slots: [...]` array of the plugin listed beside it —",
    "the exact sibling of `contributions` in that plugin's `web/index.ts`. An",
    "entry may be a slot, or an object whose own values are slots, so",
    "`slots: [Shell, storyDetailPane]` covers a slot group and a pane in one line.",
    "",
    "  slot id / kind / plugin directory whose source constructed it",
    ...lines,
    ...(anyRuntimeId
      ? [
          "",
          "A `(runtime id)` row has no static call site: its id is built at run time,",
          "by a factory or a pane. Declare the OBJECT that owns it — the pane, the",
          "factory's result — on the plugin that creates it.",
        ]
      : []),
  ].join("\n");
}
