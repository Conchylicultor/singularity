import {
  closestTagNames,
  defaultTagColor,
  tagKey,
  TagNameSchema,
  type TagColor,
} from "../../core";

/**
 * One tag a writer asks a page to carry, by NAME — what an agent writes in the
 * `<page-meta>` header. `create` is the explicit "this is a new tag" statement
 * (`new="true"`); without it an unknown name is refused, never minted.
 */
export interface TagRequest {
  name: string;
  create?: { color?: TagColor };
}

/** A vocabulary tag, as the resolver matches against it. */
export interface VocabularyTag {
  id: string;
  name: string;
  color: TagColor;
}

/** A requested tag after resolution: one that exists, or one to create. */
export type ResolvedTag =
  | { kind: "existing"; id: string; name: string; color: TagColor }
  | { kind: "new"; name: string; color: TagColor };

/**
 * The verdict on a tag list. `ok: false` writes nothing: every name that is
 * neither in the vocabulary nor marked `create` is listed with the closest
 * existing names, beside the whole vocabulary, so the writer can pick one or
 * say it means a new tag. A name marked `create` that is not a storable tag
 * name is `invalid`, with the reason.
 */
export type TagResolution =
  | {
      ok: true;
      /** The page's tags, in order, duplicates collapsed. */
      tags: ResolvedTag[];
      /** Canonical names of the tags this list would create. */
      created: string[];
    }
  | {
      ok: false;
      unknown: { name: string; suggestions: string[] }[];
      invalid: { name: string; reason: string }[];
      vocabulary: string[];
    };

/**
 * Resolve `requests` against `vocabulary` — the pure half of
 * `resolveTagNames`.
 *
 * - A name matches a tag by its KEY (`tagKey`: case-, and whitespace-
 *   insensitive) and resolves to the stored spelling and color.
 * - Order is kept and duplicates (by key) collapse onto the first occurrence;
 *   a later duplicate carrying `create` still counts as asking to create.
 * - `create` on a name that already exists resolves to the existing tag (its
 *   color is not changed — recoloring is the vocabulary's own edit).
 * - `create` on an unknown name mints it under its normalized spelling, with
 *   the given color or the name's deterministic default.
 */
export function resolveTagRequests(
  requests: readonly TagRequest[],
  vocabulary: readonly VocabularyTag[],
): TagResolution {
  const byKey = new Map(vocabulary.map((t) => [tagKey(t.name), t]));
  // First occurrence fixes the position; any occurrence may carry `create`.
  const order: string[] = [];
  const merged = new Map<string, TagRequest>();
  for (const request of requests) {
    const key = tagKey(request.name);
    const seen = merged.get(key);
    if (seen === undefined) {
      order.push(key);
      merged.set(key, request);
    } else if (seen.create === undefined && request.create !== undefined) {
      merged.set(key, { name: seen.name, create: request.create });
    }
  }

  const tags: ResolvedTag[] = [];
  const created: string[] = [];
  const unknown: { name: string; suggestions: string[] }[] = [];
  const invalid: { name: string; reason: string }[] = [];
  const names = vocabulary.map((t) => t.name);
  for (const key of order) {
    const request = merged.get(key)!;
    const existing = byKey.get(key);
    if (existing !== undefined) {
      tags.push({ kind: "existing", ...existing });
      continue;
    }
    if (request.create === undefined) {
      unknown.push({
        name: request.name,
        suggestions: closestTagNames(request.name, names),
      });
      continue;
    }
    const parsed = TagNameSchema.safeParse(request.name);
    if (!parsed.success) {
      invalid.push({
        name: request.name,
        reason: parsed.error.issues.map((i) => i.message).join("; "),
      });
      continue;
    }
    const name = parsed.data;
    tags.push({
      kind: "new",
      name,
      color: request.create.color ?? defaultTagColor(name),
    });
    created.push(name);
  }
  if (unknown.length > 0 || invalid.length > 0) {
    return { ok: false, unknown, invalid, vocabulary: names };
  }
  return { ok: true, tags, created };
}
