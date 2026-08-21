import type { SlotHandle } from "@plugins/framework/plugins/slot-declaration/core";
import { existsSync } from "fs";
import { dirname, join, relative, sep } from "path";
import {
  buildEnrichedTree,
  declareSlotsFromBarrels,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getFacet } from "@plugins/plugin-meta/plugins/facets/core";
import { contributionsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import {
  importBarrel,
  registerBarrelStubs,
} from "@plugins/plugin-meta/plugins/barrel-import/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import type { BlockHandle } from "@plugins/page/plugins/editor/core";
import type {
  Check,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";

// The web dispatch slot every block type registers its handle on
// (`Editor.Block`, `page/editor/web/slots.ts`). A block TYPE exists, as far as
// the editor is concerned, exactly when a plugin contributes here — so this is
// the enumeration, not a directory sweep for `define*Block(` call sites (which
// `no-adhoc-marker-scan` bans, and which could not read the resulting handle
// anyway).
const WEB_BLOCK_SLOT = "page.editor.block";

/**
 * This plugin's own directory — the annotation FAMILY's root. Derived from the
 * check's own location rather than written out as a path literal, so moving or
 * renaming the umbrella cannot leave the check silently scanning a path that no
 * longer holds annotations.
 *
 * It is matched against the enriched tree's absolute dirs. If those two ever
 * disagree (a symlinked checkout resolving differently for git and for the
 * module loader), the candidate set comes back EMPTY — which this check reports
 * as a loud tooling failure below rather than as a pass, so the disagreement can
 * never masquerade as "every annotation is marked".
 */
const ANNOTATIONS_ROOT = dirname(import.meta.dir);

/**
 * Every block type defined under `page/annotations` declares an audience.
 *
 * `defineAnnotationBlock` (`core/define-annotation-block.ts`) makes `audience`
 * REQUIRED, so an annotation written through it cannot be unmarked. What the
 * type system cannot see is a new annotation reaching for `defineContainerBlock`
 * — or `defineBlock` — directly: both are perfectly valid calls that produce a
 * perfectly working dashed card, and the only thing missing is the one field a
 * redaction filter reads. That card would then be an ORDINARY container, and
 * "absent audience means ordinary page content, visible to everyone" would hand
 * it to an agent. A `/private`-shaped block that leaks is precisely the failure
 * this family exists to prevent, and it would leak silently, in the direction
 * that cannot be undone.
 *
 * The discriminator is presence of `audience` on the handle, because nothing but
 * `defineAnnotationBlock` sets it: `defineBlock` does not accept the field and
 * `ContainerBlockOptions` does not declare it, so presence IS the proof that the
 * type went through the factory that makes the declaration mandatory. The VALUE
 * is left to tsc (`BlockAudience` is a closed union) — restating the two
 * literals here would be a second source of truth for a set the type already
 * closes.
 *
 * Handles are read by IMPORTING the same web barrels the docgen tree imports —
 * the same technique as `page-editor:anchor-has-decoration`, whose module
 * comment explains why a static source scan cannot recover a handle's fields.
 */
const audienceDeclared: Check = {
  id: "annotations:audience-declared",
  description:
    "every block type defined under `page/annotations` goes through `defineAnnotationBlock`, so it declares who its content is for (`audience`) instead of defaulting into agent-visible",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();
    const tree = await buildEnrichedTree(root);
    registerBarrelStubs(root);

    // The block slot resolved ONCE, then compared by IDENTITY in the loop below,
    // so no id string survives into the loop to drift and match nothing.
    //
    // `"registry"` scope, and it is free: `buildEnrichedTree` above already
    // awaited this very (memoized) pass. It is the DECLARING plugin — the
    // editor — that has to be in scope, never the candidate: a candidate's
    // contribution carries the same `blockSlot` OBJECT whether or not its own
    // plugin is disabled, so identity still catches a disabled annotation.
    //
    // `findSlot`, never `slotNamed`: the runner awaits every check under
    // `Promise.all` and rethrows, so a throw here would kill every other check's
    // reporting. A miss is this check's own failure value.
    const naming = await declareSlotsFromBarrels(root, "registry");
    const blockSlot = naming.findSlot(WEB_BLOCK_SLOT);
    if (blockSlot === undefined) {
      return {
        ok: false,
        message:
          `No slot is declared under "${WEB_BLOCK_SLOT}" in the registry-scoped ` +
          `declaration pass, so no block type could be read and the audience ` +
          `invariant was NOT verified. An id derives from its declaring plugin's ` +
          `id plus its \`slots\` key, so moving the editor renames it. This is a ` +
          `check/tooling failure, not a clean pass.`,
      };
    }

    // Candidates: plugins inside this umbrella that contribute a block renderer.
    // A descendant at ANY depth counts — a future annotation may be an umbrella
    // of its own (the plan already nests one under `agent-notes`), and a nested
    // block type is no less an annotation.
    const candidateDirs = new Set<string>();
    for (const [dir, node] of tree.byDir) {
      if (!dir.startsWith(ANNOTATIONS_ROOT + sep)) continue;
      const facet = getFacet(node, contributionsFacetDef);
      if (!facet) continue;
      for (const c of facet.runtime) {
        if (c.kind === "slot" && c.slotId === WEB_BLOCK_SLOT) {
          if (existsSync(join(dir, "web", "index.ts"))) candidateDirs.add(dir);
          break;
        }
      }
    }

    // Fail LOUD rather than pass vacuously. An empty candidate set means either
    // the contributions facet degraded or the umbrella moved out from under
    // `ANNOTATIONS_ROOT` — in both cases the invariant was NOT verified, and a
    // silent green here is exactly how the family would stop being checked at
    // all without anyone noticing.
    if (candidateDirs.size === 0) {
      return {
        ok: false,
        message:
          `No web \`Editor.Block\` contributions were found under ${relative(root, ANNOTATIONS_ROOT)} ` +
          "— either the barrel-imported contributions facet is empty or the annotations umbrella " +
          "no longer lives where this check looks, so the audience invariant could not be " +
          "verified. This is a check/tooling failure, not a clean pass.",
      };
    }

    // "<plugin id> (<block type>)" for each annotation block with no audience.
    const unmarked: string[] = [];
    for (const dir of candidateDirs) {
      const mod = await importBarrel(join(dir, "web", "index.ts"));
      const def = mod.default as { contributions?: unknown } | undefined;
      if (!Array.isArray(def?.contributions)) continue;
      for (const raw of def.contributions) {
        const c = raw as { _slot?: SlotHandle; block?: BlockHandle<unknown> };
        if (c._slot !== blockSlot || !c.block) continue;
        if (c.block.audience === undefined) {
          unmarked.push(`${tree.byDir.get(dir)?.id ?? dir} (${c.block.type})`);
        }
      }
    }

    if (unmarked.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${unmarked.length} annotation block type(s) declare no \`audience\`, so an agent-facing ` +
        'read path — which withholds by filtering the family for `audience === "human"` and ' +
        "never by naming a type — would treat them as ordinary page content and send them:\n" +
        unmarked
          .sort()
          .map((entry) => `  ${entry}`)
          .join("\n"),
      hint:
        "Define the block with `defineAnnotationBlock` instead of `defineContainerBlock`:\n" +
        '  import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";\n' +
        '  export const fooBlock = defineAnnotationBlock({ …, audience: "agent" | "human" });\n' +
        "It is `defineContainerBlock` plus one REQUIRED field, so nothing else about the block " +
        "changes. Pick `human` if an agent must never receive the card's contents (the " +
        "`/private` case), `agent` if the card is addressed to, or written by, an agent. " +
        "There is deliberately no default: an annotation nobody classified is the one thing " +
        "this family cannot represent.",
    };
  },
};

export default audienceDeclared;
