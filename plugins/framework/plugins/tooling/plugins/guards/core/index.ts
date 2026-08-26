export { GUARDS } from "./registry";
export type {
  AllowVerdict,
  DenyVerdict,
  InformVerdict,
  Guard,
  GuardContext,
  Verdict,
  ToolMatcher,
  FileHint,
} from "./types";
export { defineGuard } from "./define-guard";
export { MODULE_EXTENSION } from "./module-extension";
export { parseShell } from "./parse-shell";
export { parseArgv, redirectionTargets } from "./argv";
export type { ParsedArgv, FileOperand, KnownCommand } from "./argv";
export { createContext } from "./context";
export {
  classify,
  detectPoll,
  watchSubjects,
  THRESHOLD,
  WINDOW_MS,
  WINDOW_SIZE,
} from "./poll-detect";
export type {
  CommandClass,
  PollDecision,
  WatchSubject,
  WindowEntry,
} from "./poll-detect";
