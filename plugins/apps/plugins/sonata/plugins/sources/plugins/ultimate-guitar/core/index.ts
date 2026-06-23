/**
 * `@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/core` —
 * pure, framework-free public API for the Ultimate Guitar source.
 *
 * Re-exports the normalized raw-tab schema/type, the URL→tab-id resolver, the
 * fetch-error taxonomy, and the raw-markup parser (content → structured model).
 * This leaf has ONLY a `core` runtime and depends on nothing but `zod`.
 */

export { UgTabSchema, UgSearchResultSchema } from "./raw-tab";
export type { UgTab, UgSearchResult } from "./raw-tab";

export { extractUgTabId } from "./tab-url";

export { UgFetchError } from "./errors";
export type { UgFetchErrorKind } from "./errors";

export { parseUgTab, parseUgContent, UgParseError } from "./parse";
export type {
  UgParseErrorKind,
  ParsedTab,
  ParsedSection,
  ParsedLine,
  ParsedChord,
} from "./parse";
