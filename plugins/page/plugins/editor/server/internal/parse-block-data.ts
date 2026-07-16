import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { BlockData } from "../../core";
// Deep relative import on purpose: this file is in every `tables.ts` schema
// graph (via the server barrel), which drizzle-kit must load SYNCHRONOUSLY —
// the core barrel would pull the async lexical/yjs bridges in with it.
import { runsOf } from "../../core/rich-text";
import { resolveBlockHandle } from "./block-registry";

/**
 * Validate a block's `data` against its type's schema and mint the branded
 * {@link BlockData}. THE sole minting site: the `page_blocks.data` column is
 * `$type<BlockData>`, so every write funnels through here and skipping validation
 * is a compile error, not a convention.
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
    handle.acceptsText && source && typeof source === "object" && "text" in source
      ? { ...(source as object), text: runsOf((source as { text?: unknown }).text) }
      : source;

  const result = handle.schema.strict().safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new HttpError(400, `Invalid data for block type "${type}": ${issues}`);
  }
  // The ONLY cast: a strict parse against the type's own schema is exactly what
  // "validated block data" means, so this is where the brand is minted.
  return result.data as BlockData;
}
