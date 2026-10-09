import type {
  PageMetaTag,
  ParsedPageMeta,
} from "@plugins/page/plugins/markdown-apply/core";
import {
  TAG_COLORS,
  tagKey,
  type TagColor,
} from "@plugins/page/plugins/tags/core";
import type {
  TagRequest,
  TagResolution,
} from "@plugins/page/plugins/tags/server";

/**
 * `edit_page`'s reading of the `<page-meta>` header's ONE writable section,
 * `<tags>`. The header module carries a tag line as `{name, attrs}` and gives it
 * no meaning; this is where `new="true"` and `color` mean something.
 */

/**
 * A title opening with a `[Something] ` prefix — the hand-written status
 * convention tags replace (`[In progress] Cold start`). A rename to one is
 * refused, pointing at tags.
 */
export const BRACKET_STATUS_PREFIX = /^\s*\[[^\]]+\](\s|$)/;

/**
 * Whether the header's READ-ONLY facts changed between the read and the
 * edit — its attributes, breadcrumb and backlinks, everything but `<tags>`.
 */
export function metaFactsChanged(
  read: ParsedPageMeta | null,
  next: ParsedPageMeta,
): boolean {
  const facts = (m: ParsedPageMeta | null) =>
    m === null
      ? null
      : JSON.stringify({
          attrs: m.attrs,
          breadcrumb: m.breadcrumb,
          backlinks: m.backlinks,
        });
  return facts(read) !== facts(next);
}

/** A tag list's identity: names by key, in order, with their attributes. */
function signature(tags: readonly PageMetaTag[]): string {
  return JSON.stringify(
    tags.map((t) => [
      tagKey(t.name),
      Object.entries(t.attrs).sort(([a], [b]) => a.localeCompare(b)),
    ]),
  );
}

/**
 * The tag list the edit asks for, as resolver requests — or `null` when it
 * asks for no change: the edited header states no `<tags>` section (or no
 * header at all), or its list is the read's (names compared case- and
 * whitespace-insensitively, in order; a `new` or `color` attribute counts as a
 * change). `ok: false` names a malformed attribute value.
 */
export function tagRequestsOf(
  read: ParsedPageMeta | null,
  next: ParsedPageMeta | null,
): { ok: true; requests: TagRequest[] } | { ok: false; reason: string } | null {
  if (next === null || next.tags === null) return null;
  if (signature(read?.tags ?? []) === signature(next.tags)) return null;
  const requests: TagRequest[] = [];
  for (const tag of next.tags) {
    const { new: isNew, color } = tag.attrs;
    const line = `<tag name=${JSON.stringify(tag.name)}>`;
    if (isNew !== undefined && isNew !== "true") {
      return {
        ok: false,
        reason:
          `the ${line} line says new=${JSON.stringify(isNew)}; the only value ` +
          `is new="true", which creates the tag. Nothing was written.`,
      };
    }
    if (color !== undefined && isNew === undefined) {
      return {
        ok: false,
        reason:
          `the ${line} line sets a color without new="true": a color is ` +
          `chosen when a tag is created, and an existing tag keeps its own ` +
          `(recolor it in the Pages app). Drop color, or add new="true" for a ` +
          `new tag. Nothing was written.`,
      };
    }
    if (color !== undefined && !isTagColor(color)) {
      return {
        ok: false,
        reason:
          `the ${line} line's color ${JSON.stringify(color)} is not one of ` +
          `${TAG_COLORS.join(", ")}. Nothing was written.`,
      };
    }
    requests.push(
      isNew === undefined
        ? { name: tag.name }
        : { name: tag.name, create: color === undefined ? {} : { color } },
    );
  }
  return { ok: true, requests };
}

function isTagColor(value: string): value is TagColor {
  const colors: readonly string[] = TAG_COLORS;
  return colors.includes(value);
}

/** The refusal for a tag list naming tags the vocabulary does not hold. */
export function tagRefusal(
  resolution: Extract<TagResolution, { ok: false }>,
): string {
  const parts: string[] = [];
  if (resolution.unknown.length > 0) {
    const named = resolution.unknown.map(
      (u) =>
        `${JSON.stringify(u.name)} (${
          u.suggestions.length === 0
            ? "no close match"
            : `closest: ${u.suggestions.map((n) => JSON.stringify(n)).join(", ")}`
        })`,
    );
    parts.push(
      `the <tags> list names tags that do not exist: ${named.join("; ")}. ` +
        `The tags that exist are: ${
          resolution.vocabulary.length === 0
            ? "none yet"
            : resolution.vocabulary.map((n) => JSON.stringify(n)).join(", ")
        }. Use an existing name, or — only if you really mean a NEW tag — add ` +
        `new="true" to its line (optionally color="<one of ` +
        `${TAG_COLORS.join(", ")}>"): <tag name="Blocked" new="true"/>.`,
    );
  }
  for (const bad of resolution.invalid) {
    parts.push(
      `${JSON.stringify(bad.name)} cannot be a tag name: ${bad.reason}.`,
    );
  }
  return `${parts.join(" ")} Nothing was written.`;
}
