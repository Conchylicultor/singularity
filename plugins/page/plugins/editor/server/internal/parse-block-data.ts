import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { BlockData } from "../../core";
// Deep relative imports on purpose: this file is in every `tables.ts` schema
// graph (via the server barrel), which drizzle-kit must load SYNCHRONOUSLY —
// the core barrel would pull the async lexical/yjs bridges in with it.
import { asBlockData } from "../../core/schemas";
import { runsOf } from "../../core/rich-text";
import { blockAuthorOf } from "../../core/define-block";
import { resolveBlockHandle } from "./block-registry";

/**
 * Validate a block's `data` against its type's schema and mint the branded
 * {@link BlockData}. THE sole WRITE-side minting site: the `page_blocks.data`
 * column's type is `BlockData`, so every write funnels through here and skipping
 * validation is a compile error, not a convention. (The read side re-establishes
 * the brand by provenance, in the column's own decoder — see `asBlockData`.)
 *
 * Unknown keys are a LOUD 400, never stripped: silently canonicalizing the write
 * would hide the class of bug this boundary exists to catch (e.g. `text` injected
 * into a void block type). Absent `data` falls back to the type's `empty()` so a
 * `page` created without a body materializes `{ title, icon }` rather than `{}`.
 *
 * `.strict()` is TOP-LEVEL only — nested objects (page `cover`, text runs) keep
 * zod's default strip. That is a deliberate, known scope limit.
 */
export function parseBlockData(type: string, data: unknown): BlockData {
  const handle = resolveBlockHandle(type);
  if (!handle) throw new HttpError(400, `Unknown block type "${type}"`);

  const source = data ?? handle.empty?.() ?? {};
  // Canonicalize a string `data.text` to runs BEFORE the strict parse: the
  // persisted shape is runs-only (the `string | RichText` union is retired), so a
  // string would now fail validation. This is the compat seam for history
  // restore, which replays pre-migration `entity_versions` snapshots whose
  // `data.text` is still a string. Gated on `acceptsText` AND on `text` being
  // PRESENT — a MISSING `text` on a text-bearing type must stay a loud 400, never
  // be materialized as `[]`.
  const normalized =
    handle.acceptsText &&
    source &&
    typeof source === "object" &&
    "text" in source
      ? {
          ...(source as object),
          text: runsOf((source as { text?: unknown }).text),
        }
      : source;

  const result = handle.schema.strict().safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new HttpError(
      400,
      `Invalid data for block type "${type}": ${issues}`,
    );
  }
  // A strict parse against the type's own schema is exactly what "validated
  // block data" means, so this is what the brand is minted from. The cast itself
  // lives in `asBlockData`, the one place it is spelled.
  return asBlockData(result.data);
}

declare const blockDataRewriteBrand: unique symbol;

/**
 * Validated `data` for an UPDATE of an existing row — {@link BlockData} that has
 * also been proven not to change whose words the row holds. Type-only brand; a
 * sub-brand of `BlockData`, so it is still accepted wherever an insert is.
 *
 * `BlockColumnChanges.data` (`forest-writer.ts`) takes THIS brand and not the
 * plain one, so every path that rewrites an existing row's payload — the op
 * reducer's persist, the patch writer, `PATCH /api/blocks/:id`, history restore,
 * turn-into-page — is a tsc error until it goes through {@link rewriteBlockData}.
 * A create stays free: `NewBlockRow.data` is plain `BlockData`, because a new
 * row has no author to keep.
 */
export type BlockDataRewrite = BlockData & {
  readonly [blockDataRewriteBrand]: never;
};

/**
 * THE minting site for {@link BlockDataRewrite}: validate `next` as a
 * {@link parseBlockData} does, and — when the row keeps its type — refuse a
 * payload that changes the row's AUTHOR (409).
 *
 * The one row whose author lives in its data today is a page: `data.author ===
 * "agent"` makes it an agent-authored page, whose whole content an agent may
 * write (`research/2026-09-11-page-agent-pages.md`). That marker is the page's
 * KIND, set once at creation. Every page-data writer spreads `{...pageData(page),
 * title}` and so carries it through; one that did not — a stale client, a
 * hand-written PATCH, a history snapshot — would silently hand a human's page to
 * an agent's pen, or take an agent's page away from it. Neither is a data edit,
 * so neither is expressible as one.
 *
 * Generic, and it names no field: the comparison is `blockAuthorOf` over the
 * handle, before and after, so a future data-decided author is covered by
 * construction.
 *
 * A TYPE change is not judged here: a type's author is a different question
 * (`agent-note` → `context` is a retype, and every type transition into or out of
 * `page` is refused or special-cased at the handlers), and turn-into-page — the
 * one sanctioned way INTO a page, the only place a page is born agent-authored
 * in place — mints through here with a type change for exactly that reason.
 */
export function rewriteBlockData(args: {
  /** The type the row will hold after this write. */
  type: string;
  /** The row as it is stored now. */
  before: { type: string; data: unknown };
  /** The payload being written. */
  next: unknown;
}): BlockDataRewrite {
  const { type, before, next } = args;
  const data = parseBlockData(type, next);
  if (before.type === type) {
    // `parseBlockData` resolved (or threw for) this same handle just above.
    const handle = resolveBlockHandle(type)!;
    const was = blockAuthorOf(handle, before.data);
    const now = blockAuthorOf(handle, data);
    if (was !== now) {
      throw new HttpError(
        409,
        `Cannot change whose words a "${type}" block holds (from ${was ?? "human"} to ` +
          `${now ?? "human"}) by rewriting its data: authorship is fixed when the block ` +
          `is created. Carry the stored value through unchanged.`,
      );
    }
  }
  // `data` came out of the strict parse above, and the author check has passed:
  // exactly the two facts the brand states.
  return data as BlockDataRewrite;
}
