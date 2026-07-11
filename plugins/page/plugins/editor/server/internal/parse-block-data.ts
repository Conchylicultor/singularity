import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { BlockData } from "../../core";
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

  const result = handle.schema
    .strict()
    .safeParse(data ?? handle.empty?.() ?? {});
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
