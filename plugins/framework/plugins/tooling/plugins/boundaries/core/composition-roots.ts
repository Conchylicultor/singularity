import boundaryConfig from "../boundary-config";

// The composition roots that wire plugins together, derived from the single
// source of truth: the `exclude` list in boundary-config.ts. These files are
// exempt from the plugin-import boundary rules (they legitimately import plugin
// default exports / runtimes to assemble the app). Consumers that need to skip
// composition roots (e.g. the no-plugin-imports-in-core check) read this list
// instead of maintaining their own parallel copy — when a registry root moves,
// only boundary-config.ts changes.
export const compositionRoots: readonly string[] = boundaryConfig.exclude ?? [];
