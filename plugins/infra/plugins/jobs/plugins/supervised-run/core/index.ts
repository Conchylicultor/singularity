// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: this barrel reaches
// `node:fs` and resolves per-worktree paths. It lives in `core/` so a CLI
// process — which cannot reach a `server/` barrel — can read the same exit
// marker the backend reads, rather than re-deriving the format. It must NEVER
// be imported from `web/`, and it deliberately touches no `db` and no jobs
// queue: what is here is the file format and the process probe, nothing else.

export {
  HARD_KILL_EXIT_CODE,
  isPidAlive,
  readRunTerminal,
  RunMarkerError,
} from "./internal/terminal";
export type { RunTerminal } from "./internal/terminal";
export { supervisedArgv, RUN_TERMINAL_ENV } from "./internal/shim";
export { assertRunKindId, assertRunId } from "./internal/ids";
