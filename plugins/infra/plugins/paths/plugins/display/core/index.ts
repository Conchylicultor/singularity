// NEVER re-export anything from the parent `paths` plugin here — in particular
// `paths/core/internal/paths.ts`, which calls `homedir()` at module scope. This
// barrel is imported by BROWSER code (the prototypes gallery), and a single
// `node:os` edge would break the web bundle at module eval. Strings only.
export {
  PROTOTYPES_DIR_DISPLAY,
  SECRETS_DIR_DISPLAY,
} from "./internal/display";
