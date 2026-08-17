// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: this barrel reaches
// `node:fs` / `node:path` and spawns git. It lives in `core/` (not `server/`)
// because the check runner's `core → core` isolation puts `server/` out of
// reach, and `format-clean` must share this exact implementation with the
// build. This plugin must NEVER be imported from `web/`.

export {
  FORMATTABLE_EXTENSIONS,
  isFormattable,
  formatSource,
  formatIfFormattable,
} from "./internal/prettier";
export type { SourceBytes } from "./internal/prettier";
export { listChangedFormattableFiles } from "./internal/changed-files";
export {
  findDisplacedDirectives,
  findUnformatted,
  formatChangedSources,
} from "./internal/format-sources";
export {
  findDirectiveDisplacements,
  formatDirectiveDisplacementReport,
} from "./internal/directive-displacement";
export type {
  DirectiveDisplacement,
  DirectiveTarget,
} from "./internal/directive-displacement";
